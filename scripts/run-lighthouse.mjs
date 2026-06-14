#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const reportDir = path.join(root, '.lighthouseci');
const thresholds = {
  performance: 0.98,
  accessibility: 0.98,
  'best-practices': 0.98,
  seo: 0.98,
};

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
};

function contentType(filePath) {
  return types[path.extname(filePath)] || 'application/octet-stream';
}

async function findFile(urlPath) {
  const safePath = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const direct = path.join(dist, safePath);
  const nested = path.join(dist, safePath, 'index.html');

  for (const candidate of [direct, nested, path.join(dist, 'index.html')]) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const filePath = await findFile(url.pathname);
      if (!filePath) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      response.writeHead(200, {
        'content-type': contentType(filePath),
        'cache-control': 'no-store',
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const server = createStaticServer();
const port = await listen(server);
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH,
  chromeFlags: ['--headless=new', '--no-sandbox'],
});

try {
  const url = `http://127.0.0.1:${port}/`;
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: Object.keys(thresholds),
  });
  const lhr = result.lhr;
  const scores = Object.fromEntries(
    Object.entries(lhr.categories).map(([key, value]) => [key, value.score]),
  );

  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, 'lighthouse-report.json'),
    JSON.stringify(lhr, null, 2),
  );

  for (const [key, threshold] of Object.entries(thresholds)) {
    if ((scores[key] || 0) < threshold) {
      throw new Error(`${key} scored ${Math.round((scores[key] || 0) * 100)}.`);
    }
  }

  for (const [key, score] of Object.entries(scores)) {
    console.log(`${key}: ${Math.round(score * 100)}`);
  }
} finally {
  await chrome.kill();
  server.close();
}
