import { Router, Request, Response } from 'express';
import Artist from '../models/Artist';
import NewsReview from '../models/NewsReview';

const router = Router();

const BASE_URL = 'https://www.mtgartistconnection.com';

const staticPaths = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/news', priority: '0.9', changefreq: 'daily' },
    { path: '/calendar', priority: '0.8', changefreq: 'weekly' },
    { path: '/contact', priority: '0.5', changefreq: 'monthly' },
    { path: '/privacypolicy', priority: '0.3', changefreq: 'yearly' },
    { path: '/termsofservice', priority: '0.3', changefreq: 'yearly' },
    { path: '/affiliate-disclosure', priority: '0.3', changefreq: 'yearly' },
];

router.get('/', async (_req: Request, res: Response) => {
    try {
        const [artists, articles] = await Promise.all([
            Artist.find({}, 'name').lean(),
            NewsReview.find({ isPublished: true }, '_id publishedAt').lean(),
        ]);

        const today = new Date().toISOString().split('T')[0];

        const urls: string[] = [];

        for (const { path, priority, changefreq } of staticPaths) {
            urls.push(`  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
        }

        for (const artist of artists) {
            const encoded = encodeURIComponent(artist.name);
            urls.push(`  <url>
    <loc>${BASE_URL}/artist/${encoded}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
        }

        for (const article of articles) {
            const lastmod = article.publishedAt
                ? new Date(article.publishedAt).toISOString().split('T')[0]
                : today;
            urls.push(`  <url>
    <loc>${BASE_URL}/news/${article._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.7</priority>
  </url>`);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(xml);
    } catch (err) {
        console.error('Sitemap generation error:', err);
        res.status(500).send('Error generating sitemap');
    }
});

export default router;
