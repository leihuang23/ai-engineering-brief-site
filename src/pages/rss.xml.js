import rss from '@astrojs/rss';
import { getBriefs } from '../lib/briefs';

export async function GET(context) {
  const briefs = await getBriefs();

  return rss({
    title: 'AI Engineering Brief',
    description: 'A twice-weekly briefing on practical AI engineering.',
    site: context.site,
    items: briefs.map((brief) => ({
      title: brief.data.title,
      description: brief.data.summary,
      pubDate: brief.data.date,
      link: `/briefs/${brief.id}/`,
    })),
  });
}
