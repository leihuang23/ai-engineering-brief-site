import { getCollection } from 'astro:content';

export const PAGE_SIZE = 10;

export async function getBriefs() {
  const briefs = await getCollection('briefs');

  return briefs.sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}
