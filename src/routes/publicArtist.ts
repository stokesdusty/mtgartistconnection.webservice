import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import Artist, { IArtist } from '../models/Artist';

const router = Router();

const BASE_URL = 'https://www.mtgartistconnection.com';

const publicArtistRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // generous for a "cache gently, refresh occasionally" consumer
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
});

// Fields intentionally excluded: email, signingComment, and other internal-use
// fields on IArtist must never be added here — this response feeds third parties.
const SOCIAL_LINK_FIELDS: (keyof IArtist)[] = [
    'facebook',
    'instagram',
    'twitter',
    'patreon',
    'youtube',
    'artstation',
    'bluesky',
    'omalink',
    'inprnt',
    'mountainmage',
    'markssignatureservice',
];

router.get('/:artistName', publicArtistRateLimiter, async (req: Request, res: Response) => {
    const artistName = req.params.artistName?.trim();

    if (!artistName) {
        return res.status(400).json({ error: 'artistName is required' });
    }

    try {
        // Case-insensitive exact match via collation, not regex, since artistName
        // is untrusted input and a hand-built regex would risk ReDoS/injection.
        const artist = await Artist.findOne({ scryfall_name: artistName })
            .collation({ locale: 'en', strength: 2 })
            .lean<IArtist>();

        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        const links: Partial<Record<keyof IArtist, string>> = {};
        for (const field of SOCIAL_LINK_FIELDS) {
            const value = artist[field];
            if (value) {
                links[field] = value as string;
            }
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.json({
            name: artist.name,
            pageUrl: `${BASE_URL}/artist/${encodeURIComponent(artist.name)}`,
            location: artist.location || null,
            website: artist.url || null,
            links,
        });
    } catch (err) {
        console.error('Public artist lookup error:', err);
        res.status(500).json({ error: 'Error fetching artist data' });
    }
});

export default router;
