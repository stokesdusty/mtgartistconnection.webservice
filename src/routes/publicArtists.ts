import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import Artist, { IArtist } from '../models/Artist';
import { toPublicArtistPayload } from './publicArtist';

const router = Router();

const publicArtistsRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 12, // this is a full-table export meant to be cached daily, not polled
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
});

router.get('/', publicArtistsRateLimiter, async (_req: Request, res: Response) => {
    try {
        const artists = await Artist.find().lean<IArtist[]>();

        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.json(artists.map(toPublicArtistPayload));
    } catch (err) {
        console.error('Public artist list error:', err);
        res.status(500).json({ error: 'Error fetching artist data' });
    }
});

export default router;
