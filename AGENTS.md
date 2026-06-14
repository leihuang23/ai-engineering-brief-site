# AI Engineering Brief Site

This repository is a static Astro site for the AI Engineering Brief.

## Project Rules

- Keep the site static-first and fast; avoid client JavaScript unless it directly supports reading ergonomics.
- Store published briefs in `src/content/briefs` as Markdown or MDX.
- Preserve the content schema in `src/content/config.ts` when adding new brief metadata.
- Verify changes with `npm run build` before claiming completion.
- Use `npm run publish:brief` for Hermes cron publishing.

## Deployment

- Build output is `dist`.
- Cloudflare Pages project name is `ai-engineering-brief-site`.
- Production domain is `ai-news.leihuang.me`.
