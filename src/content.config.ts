import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const briefs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/briefs' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.coerce.date(),
    cadence: z.enum(['Wednesday', 'Sunday']),
    sources: z
      .array(
        z.object({
          title: z.string(),
          url: z.url(),
        }),
      )
      .default([]),
  }),
});

export const collections = { briefs };
