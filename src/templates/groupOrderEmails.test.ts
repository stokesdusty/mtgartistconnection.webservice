import {
    approvedEmail,
    cancelledEmail,
    cutoffReminderEmail,
    itemEmail,
    joinRequestEmail,
    packageReceivedEmail,
    pricesChangedEmail,
    returnShippedEmail,
    signingResultsEmail,
} from './groupOrderEmails';

const base = { orderId: 'o1', orderName: 'IX run' };

describe('group order emails', () => {
    const OLD_URL = process.env.FRONTEND_URL;
    afterEach(() => { process.env.FRONTEND_URL = OLD_URL; });

    it('links the organizer to their dashboard and participants to their order', () => {
        delete process.env.FRONTEND_URL;
        expect(joinRequestEmail({ ...base, requester: 'alice.collects' }).html).toContain('https://www.mtgartistconnection.com/tracker/group/o1');
        expect(approvedEmail({ ...base, organizer: 'card.runner' }).html).toContain('https://www.mtgartistconnection.com/tracker/shared/o1');
    });

    it('follows FRONTEND_URL, so local runs link to the local site', () => {
        process.env.FRONTEND_URL = 'http://localhost:3001/';
        expect(approvedEmail({ ...base, organizer: '' }).html).toContain('http://localhost:3001/tracker/shared/o1');
    });

    it('escapes anything people typed', () => {
        const email = joinRequestEmail({ orderId: 'o1', orderName: '<script>run</script>', requester: '<b>alice</b>' });
        expect(email.html).not.toMatch(/<script>|<b>alice/);
        expect(email.html).toContain('&lt;b&gt;alice&lt;/b&gt;');
        expect(email.subject).toBe('<b>alice</b> asked to join <script>run</script>');
    });

    it('lists price changes, with TBD for unknown prices', () => {
        const { html } = pricesChangedEmail({ ...base, changes: [{ artist: 'Rebecca Guay', signatureType: 'Sketch', from: null, to: 60 }] });
        expect(html).toContain('Rebecca Guay · Sketch: TBD &rarr; <strong>$60</strong>');
    });

    it('describes items as added or priced', () => {
        expect(itemEmail({ ...base, label: 'Bolt AP', quantity: 2, price: null, added: true })).toMatchObject({ subject: 'Bolt AP added to your order' });
        expect(itemEmail({ ...base, label: 'Bolt AP', quantity: 2, price: 12.5, added: false }).html).toContain('<strong>$12.50</strong> each');
    });

    it('gives the cutoff time in Pacific time', () => {
        const { html } = cutoffReminderEmail({ ...base, cutoff: new Date('2026-11-02T06:59:00Z') });
        expect(html).toMatch(/Sunday, November 1.*10:59.*PST/);
    });

    it('calls out mismatched counts on arrival', () => {
        const matched = packageReceivedEmail({ ...base, mismatches: [] });
        expect(matched.subject).toBe('Your package arrived: IX run');
        expect(matched.html).toContain('Everything matched your list.');
        const off = packageReceivedEmail({ ...base, mismatches: [{ cardName: "Gaea's Liege", listed: 2, received: 1 }] });
        expect(off.subject).toContain('check the counts');
        expect(off.html).toContain('Gaea&#39;s Liege: you listed 2, the organizer counted <strong>1</strong>');
    });

    it('splits signing results into signed and not signed, with reasons', () => {
        const { html } = signingResultsEmail({
            ...base,
            results: [
                { cardName: 'Mana Vault', artist: 'Kaja Foglio', quantity: 2, signed: true, reason: '' },
                { cardName: 'Swords', artist: 'Rebecca Guay', quantity: 1, signed: false, reason: "Artist didn't show" },
            ],
        });
        expect(html).toContain('Signed · 2');
        expect(html).toContain('Not signed · 1');
        expect(html).toContain('Swords · Rebecca Guay: Artist didn&#39;t show');
        expect(html).toContain('come off your bill');
    });

    it('includes return tracking, and explains cancellations', () => {
        expect(returnShippedEmail({ ...base, tracking: '1Z999' }).html).toContain('1Z999');
        expect(cancelledEmail(base)).toMatchObject({ subject: 'IX run was cancelled' });
    });

    it('says the site is not a party to the order', () => {
        expect(cancelledEmail(base).html).toContain("isn't a party to them");
    });
});
