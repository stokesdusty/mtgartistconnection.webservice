import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import SigningBatch from '../models/SigningBatch';
import SigningEvent from '../models/SigningEvent';
import { artistSlots, effectiveOrderStatus, OrderRow } from '../services/groupOrders';
import { groupOrderSharePage, inactiveSharePage } from '../templates/groupOrderSharePage';
import { SITE_URL } from '../templates/siteUrl';

// GET /share/group-order/:token — the link organizers paste into Discord. It serves the
// preview (order, event, artists, slots, cutoff) and forwards people to the invite page.
// Only public summary fields are used: never private instructions or participants.

const router = Router();

const shareRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).type('text/plain').send('Too many requests. Please try again later.');
    },
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

router.get('/:token', shareRateLimiter, async (req: Request, res: Response) => {
    const token = String(req.params.token ?? '');
    const frontend = (process.env.FRONTEND_URL || SITE_URL).replace(/\/$/, '');
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
