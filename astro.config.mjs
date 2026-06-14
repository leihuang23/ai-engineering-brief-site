import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ai-news.leihuang.me',
  output: 'static',
  integrations: [mdx(), sitemap()],
});
