#!/usr/bin/env node
import { exec as execCallback, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execCallback);
const root = process.cwd();
const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function getArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  console.log(`Usage:
  npm run publish:brief -- --input ./brief.json
  BRIEF_GATHER_COMMAND="hermes brief --cadence Sunday --json" npm run publish:brief

Flags:
  --input <file>       Read brief JSON from a file.
  --stdin             Read brief JSON from stdin.
  --skip-build        Write MDX without running Astro build.
  --skip-deploy       Build without deploying to Cloudflare Pages.
  --skip-telegram     Deploy without sending Telegram.
  --git               Commit and push the generated MDX file.
`);
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`));
    });
  });
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadPayload() {
  const input = getArg('--input');
  if (input) return JSON.parse(await readFile(path.resolve(root, input), 'utf8'));
  if (hasFlag('--stdin')) return JSON.parse(await readStdin());
  if (process.env.BRIEF_JSON) return JSON.parse(process.env.BRIEF_JSON);
  if (process.env.BRIEF_GATHER_COMMAND) {
    const { stdout } = await exec(process.env.BRIEF_GATHER_COMMAND, {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  }

  usage();
  process.exit(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function cadenceFromDate(date) {
  const day = date.getUTCDay();
  if (day === 0) return 'Sunday';
  if (day === 3) return 'Wednesday';
  throw new Error('Brief date must be a Wednesday or Sunday, or cadence must be provided.');
}

function normalizePayload(payload) {
  const date = new Date(payload.date || Date.now());
  if (Number.isNaN(date.valueOf())) throw new Error('Invalid brief date.');

  const title = payload.title?.trim();
  const summary = payload.summary?.trim();
  const body = (payload.body || payload.content || '').trim();
  const cadence = payload.cadence || cadenceFromDate(date);

  if (!title) throw new Error('Brief title is required.');
  if (!summary) throw new Error('Brief summary is required.');
  if (!body) throw new Error('Brief body/content is required.');
  if (!['Wednesday', 'Sunday'].includes(cadence)) {
    throw new Error('Brief cadence must be Wednesday or Sunday.');
  }

  const sources = Array.isArray(payload.sources)
    ? payload.sources.filter((source) => source?.title && source?.url)
    : [];
  const datePart = date.toISOString().slice(0, 10);
  const slug = slugify(payload.slug || title.replace(/^AI Engineering Brief:\s*/i, ''));

  return {
    title,
    summary,
    body,
    cadence,
    sources,
    date,
    datePart,
    slug: slug || 'brief',
  };
}

function renderMdx(brief) {
  const sources = brief.sources
    .map(
      (source) =>
        `  - title: ${yamlString(source.title)}\n    url: ${yamlString(source.url)}`,
    )
    .join('\n');

  return `---\ntitle: ${yamlString(brief.title)}\nsummary: ${yamlString(
    brief.summary,
  )}\ndate: ${brief.datePart}\ncadence: ${yamlString(brief.cadence)}\n${
    sources ? `sources:\n${sources}` : 'sources: []'
  }\n---\n\n${brief.body}\n`;
}

async function writeBrief(brief) {
  const dir = path.join(root, 'src/content/briefs');
  const id = `${brief.datePart}-${brief.slug}`;
  const filePath = path.join(dir, `${id}.mdx`);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, renderMdx(brief), 'utf8');
  return { id, filePath };
}

async function sendTelegram(brief, articleUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.');
  }

  const text = [
    `<b>${escapeHtml(brief.title)}</b>`,
    '',
    escapeHtml(brief.summary),
    '',
    `<a href="${escapeHtml(articleUrl)}">Read the full brief</a>`,
  ].join('\n');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
  }
}

async function commitAndPush(filePath, brief) {
  await run('git', ['add', filePath]);
  await run('git', [
    'commit',
    '-m',
    `Publish AI Engineering Brief for ${brief.datePart}`,
    '-m',
    [
      'Constraint: Generated from Hermes cron brief payload.',
      'Confidence: high',
      'Scope-risk: narrow',
      'Directive: Do not hand-edit generated brief metadata unless correcting a publish error.',
      'Tested: npm run build',
      'Not-tested: Live Telegram rendering beyond API acceptance.',
    ].join('\n'),
  ]);
  await run('git', ['push']);
}

async function main() {
  if (hasFlag('--help')) {
    usage();
    return;
  }

  const brief = normalizePayload(await loadPayload());
  const { id, filePath } = await writeBrief(brief);
  const siteUrl = (process.env.SITE_URL || 'https://news.leihuang.me').replace(/\/$/, '');
  const articleUrl = `${siteUrl}/briefs/${id}/`;

  if (!hasFlag('--skip-build')) await run('npm', ['run', 'build']);
  if (!hasFlag('--skip-deploy')) await run('npm', ['run', 'deploy']);
  if (hasFlag('--git')) await commitAndPush(filePath, brief);
  if (!hasFlag('--skip-telegram')) await sendTelegram(brief, articleUrl);

  console.log(`Published ${articleUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
