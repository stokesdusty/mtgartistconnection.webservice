import { Router, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { proxiedVisitorIp } from '../middleware/rateLimiter';
import SigningBatch from '../models/SigningBatch';
import SigningEvent from '../models/SigningEvent';
import { artistSlots, effectiveOrderStatus, OrderRow } from '../services/groupOrders';
import { groupOrderSharePage, inactiveSharePage } from '../templates/groupOrderSharePage';
import { publicSiteUrl } from '../templates/siteUrl';

// GET /share/group-order/:token — the link organizers paste into Discord. It serves the
// preview (order, event, artists, slots, cutoff) and forwards people to the invite page.
// Only public summary fields are used: never private instructions or participants.

const router = Router();

const tooMany = (_req: Request, res: Response) => {
    res.status(429).type('text/plain').send('Too many requests. Please try again later.');
};

// Each visitor, including those arriving through the www /join rewrite, where req.ip is a
// CloudFront edge that many visitors share.
const shareRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => ipKeyGenerator(proxiedVisitorIp(req)),
    handler: tooMany,
});

// The visitor's address comes from headers that someone calling the API directly could fake,
// so whoever actually connects (a CloudFront edge, or that caller) gets an overall cap too.
const shareSourceRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1200,
    standardHeaders: false,
    legacyHeaders: false,
    handler: tooMany,
});

const shortDate = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Oct 21–24", "Oct 30 – Nov 2", or "Oct 21". Event dates are stored as UTC date strings. */
export function eventDateRange(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) return shortDate(startDate);
    if (start.getUTCMonth() === end.getUTCMonth()) return `${shortDate(startDate)}–${end.getUTCDate()}`;
    return `${shortDate(startDate)} – ${shortDate(endDate)}`;
}

// A link with the token cut off (e.g. www.mtgartistconnection.com/join/) goes to the Signing
// Tracker, where group orders live, rather than a bare "Cannot GET".
router.get('/', (_req: Request, res: Response) => {
    res.redirect(302, `${publicSiteUrl()}/signingtracker`);
});

router.get('/:token', shareSourceRateLimiter, shareRateLimiter, async (req: Request, res: Response) => {
    const token = String(req.params.token ?? '');
    const frontend = publicSiteUrl();
    const joinUrl = `${frontend}/tracker/join/${encodeURIComponent(token)}`;
    const shareUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    res.type('html').set('Cache-Control', 'public, max-age=300');

    try {
        const batch = token && token.length <= 64 ? await SigningBatch.findOne({ 'groupOrder.inviteToken': token }).lean() : null;
        const order = batch?.groupOrder;
        if (!batch || !order || order.status === 'draft' || order.disabledAt) {
            return res.status(404).send(inactiveSharePage(shareUrl, joinUrl));
        }

        const event = order.eventId ? await SigningEvent.findById(order.eventId).lean() : null;
        const slots = artistSlots(order as any, batch.rows as unknown as OrderRow[]);
        return res.send(groupOrderSharePage({
            name: batch.name,
            organizerDiscordName: order.organizerDiscordName,
            eventName: (event?.name as string) ?? null,
            eventDates: event ? eventDateRange(event.startDate as string, event.endDate as string) : null,
            artists: slots.map((s) => ({ name: s.name, remaining: s.remaining })),
            cutoff: order.cutoff ?? null,
            status: effectiveOrderStatus(order as any),
        }, shareUrl, joinUrl));
    } catch (err) {
        console.error('Group order share page failed:', err);
        return res.status(500).send(inactiveSharePage(shareUrl, joinUrl));
    }
});

export default router;
