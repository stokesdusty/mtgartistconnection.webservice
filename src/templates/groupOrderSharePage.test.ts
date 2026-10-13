import { groupOrderSharePage, inactiveSharePage, shareDescription, ShareSummary } from './groupOrderSharePage';

const order: ShareSummary = {
    name: 'IX run',
    organizerDiscordName: 'card.runner',
    eventName: 'IX Art Show',
    eventDates: 'Oct 21–24',
    artists: [{ name: 'Rebecca Guay', remaining: 3 }, { name: 'Kaja Foglio', remaining: null }, { name: 'Seb McKinnon', remaining: 0 }],
    cutoff: new Date('2026-10-15T06:59:00Z'),
    status: 'open',
};

describe('shareDescription', () => {
    it('sums up the organizer, event, artists with slots, and cutoff', () => {
        expect(shareDescription(order)).toBe(
            'Run by card.runner (Discord, unverified) · IX Art Show, Oct 21–24 · Artists: Rebecca Guay (3 left), Kaja Foglio, Seb McKinnon (full) · Join by Oct 14');
    });

    it('caps the artist list', () => {
        const many = { ...order, artists: Array.from({ length: 9 }, (_, i) => ({ name: `Artist ${i}`, remaining: null })) };
        expect(shareDescription(many)).toContain('Artist 5 +3 more');
    });

    it('says when an order is closed or cancelled', () => {
        expect(shareDescription({ ...order, status: 'closed' })).toMatch(/No longer taking new people$/);
        expect(shareDescription({ ...order, status: 'cancelled', organizerDiscordName: '' })).toMatch(/^Group signing run.*cancelled$/);
    });
});

describe('groupOrderSharePage', () => {
    it('has the preview tags Discord reads, and sends people on to the invite page', () => {
        const html = groupOrderSharePage(order, 'https://api.test/share/group-order/tok', 'https://site.test/tracker/join/tok');
        expect(html).toContain('<meta property="og:title" content="IX run · Group order">');
        expect(html).toContain('<meta property="og:description" content="Run by card.runner');
        expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://site.test/tracker/join/tok">');
        expect(html).toContain('<meta name="robots" content="noindex">');
    });

    it('escapes what the organizer typed', () => {
        const html = groupOrderSharePage({ ...order, name: '"><script>x</script>' }, 'https://a', 'https://b');
        expect(html).not.toContain('<script>x');
        expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('still forwards links that are no longer active', () => {
        const html = inactiveSharePage('https://a', 'https://site.test/tracker/join/old');
        expect(html).toContain("isn&#39;t active");
        expect(html).toContain('url=https://site.test/tracker/join/old');
    });
});
