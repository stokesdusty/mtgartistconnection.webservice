import { button, listItem, palette, panel, renderEmail, sectionLabel } from './emailLayout';
import { publicSiteUrl } from './siteUrl';

// Transactional emails for group orders ("signing runs"). Everything people typed (order
// names, Discord names, reasons) is escaped. Links follow FRONTEND_URL so local runs link
// to the local site.

export interface GroupOrderEmail { subject: string; html: string }

export const escapeHtml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const siteUrl = publicSiteUrl;
export const organizerLink = (orderId: string) => `${siteUrl()}/tracker/group/${orderId}`;
export const participantLink = (orderId: string) => `${siteUrl()}/tracker/shared/${orderId}`;

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const priceText = (price: number | null) => (price === null ? 'TBD' : money(price));

const footer = (orderName: string, link: string) => `
  <p style="margin: 0 0 10px;">You're getting this because you're part of the group order “${escapeHtml(orderName)}”.
  You can turn these emails off on the <a href="${link}" style="color: ${palette.muted}; text-decoration: underline;">order page</a>.</p>
  <p style="margin: 0;">MTG Artist Connection keeps the record for group orders but isn't a party to them.</p>
`;

const paragraph = (html: string) => `<p style="margin: 18px 0 0; font-size: 15px; line-height: 1.6; color: ${palette.fg};">${html}</p>`;
const list = (items: string[]) => `<ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.5; color: ${palette.fg};">${items.map(listItem).join('')}</ul>`;
const cta = (href: string, label: string) => `<div style="margin-top: 26px;">${button(href, label)}</div>`;

interface Base { orderId: string; orderName: string }

/** To the organizer: someone asked to join. */
export function joinRequestEmail({ orderId, orderName, requester }: Base & { requester: string }): GroupOrderEmail {
    const name = escapeHtml(requester);
    return {
        subject: `${requester} asked to join ${orderName}`,
        html: renderEmail({
            title: 'New join request',
            preheader: `${name} wants to join your group order.`,
            eyebrow: 'Join request',
            heading: `${name} wants in.`,
            intro: `${name} asked to join <strong>${escapeHtml(orderName)}</strong>. Check the name against your Discord group before approving.`,
            body: cta(organizerLink(orderId), 'Review the request'),
            footer: footer(orderName, organizerLink(orderId)),
        }),
    };
}

/** To a participant: the organizer approved them. */
export function approvedEmail({ orderId, orderName, organizer }: Base & { organizer: string }): GroupOrderEmail {
    return {
        subject: `You're in: ${orderName}`,
        html: renderEmail({
            title: "You're in",
            preheader: 'The organizer approved you. Add your cards and see where to ship.',
            eyebrow: 'Approved',
            heading: "You're in.",
            intro: `${organizer ? `${escapeHtml(organizer)} approved you for` : "You're approved for"} <strong>${escapeHtml(orderName)}</strong>.
                Add your cards, and you'll find the shipping and payment instructions on the order page.`,
            body: cta(participantLink(orderId), 'Go to your order'),
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

export interface PriceChangeLine { artist: string; signatureType: string; from: number | null; to: number | null }

/** To participants with cards in the changed cells: prices were filled in or changed. */
export function pricesChangedEmail({ orderId, orderName, changes }: Base & { changes: PriceChangeLine[] }): GroupOrderEmail {
    return {
        subject: `Prices updated in ${orderName}`,
        html: renderEmail({
            title: 'Prices updated',
            preheader: 'The organizer updated prices for cards you have in the order.',
            eyebrow: 'Prices updated',
            heading: 'New prices for your cards.',
            intro: `The organizer of <strong>${escapeHtml(orderName)}</strong> updated prices you have cards in.`,
            body: `${sectionLabel('What changed')}${panel(list(changes.map((c) =>
                `${escapeHtml(c.artist)} · ${escapeHtml(c.signatureType)}: ${priceText(c.from)} &rarr; <strong>${priceText(c.to)}</strong>`)))}
                ${cta(participantLink(orderId), 'See your balance')}`,
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

/** To a participant: the organizer added an item for them, or priced one. */
export function itemEmail({ orderId, orderName, label, quantity, price, added }: Base & { label: string; quantity: number; price: number | null; added: boolean }): GroupOrderEmail {
    const item = `${escapeHtml(label)}${quantity > 1 ? ` &times;${quantity}` : ''}`;
    return {
        subject: added ? `${label} added to your order` : `${label} is priced`,
        html: renderEmail({
            title: added ? 'Item added' : 'Item priced',
            preheader: added ? 'The organizer added an item to your order.' : 'The organizer set the price of an item in your order.',
            eyebrow: added ? 'Item added' : 'Item priced',
            heading: added ? 'Something extra for you.' : 'An item has its price.',
            intro: `${item} in <strong>${escapeHtml(orderName)}</strong>: ${price === null ? 'price still pending' : `<strong>${money(price)}</strong> each`}.`,
            body: cta(participantLink(orderId), 'See your order'),
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

/** To approved participants: the cutoff is close. */
export function cutoffReminderEmail({ orderId, orderName, cutoff }: Base & { cutoff: Date }): GroupOrderEmail {
    const when = cutoff.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles', timeZoneName: 'short' });
    return {
        subject: `${orderName} closes soon`,
        html: renderEmail({
            title: 'Cutoff coming up',
            preheader: `Last day to add or change cards: ${when}.`,
            eyebrow: 'Cutoff reminder',
            heading: 'Two days left.',
            intro: `<strong>${escapeHtml(orderName)}</strong> stops taking card changes ${when}. Make sure your cards are in and you've marked them ready to ship.`,
            body: cta(participantLink(orderId), 'Check your cards'),
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

export interface MismatchLine { cardName: string; listed: number; received: number }

/** To a participant: the organizer has their package. */
export function packageReceivedEmail({ orderId, orderName, mismatches }: Base & { mismatches: MismatchLine[] }): GroupOrderEmail {
    const mismatchBody = mismatches.length
        ? `${sectionLabel('Counted differently')}${panel(list(mismatches.map((m) =>
            `${escapeHtml(m.cardName || 'Unnamed card')}: you listed ${m.listed}, the organizer counted <strong>${m.received}</strong>`)), 'warn')}
           ${paragraph('If that looks wrong, message the organizer.')}`
        : paragraph('Everything matched your list.');
    return {
        subject: mismatches.length ? `Your package arrived (check the counts): ${orderName}` : `Your package arrived: ${orderName}`,
        html: renderEmail({
            title: 'Package received',
            preheader: mismatches.length ? 'Some cards were counted differently from your list.' : 'Everything matched your list.',
            eyebrow: 'Package received',
            heading: 'Your cards arrived.',
            intro: `The organizer of <strong>${escapeHtml(orderName)}</strong> checked in your package.`,
            body: `${mismatchBody}${cta(participantLink(orderId), 'See your order')}`,
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

export interface SigningResult { cardName: string; artist: string; quantity: number; signed: boolean; reason: string }

/** To a participant when cards head back: what got signed, and what didn't (and why). */
export function signingResultsEmail({ orderId, orderName, results }: Base & { results: SigningResult[] }): GroupOrderEmail {
    const signed = results.filter((r) => r.signed);
    const notSigned = results.filter((r) => !r.signed);
    const count = (rows: SigningResult[]) => rows.reduce((sum, r) => sum + r.quantity, 0);
    const line = (r: SigningResult) => `${escapeHtml(r.cardName || 'Unnamed card')}${r.quantity > 1 ? ` &times;${r.quantity}` : ''} · ${escapeHtml(r.artist)}`;
    return {
        subject: `Signing results: ${orderName}`,
        html: renderEmail({
            title: 'Signing results',
            preheader: `${count(signed)} signed${notSigned.length ? `, ${count(notSigned)} not signed` : ''}.`,
            eyebrow: 'Signing results',
            heading: 'Your cards are done.',
            intro: `Here's how your cards did in <strong>${escapeHtml(orderName)}</strong>. They're heading back to you next.`,
            body: `${signed.length ? `${sectionLabel(`Signed · ${count(signed)}`)}${panel(list(signed.map(line)), 'accent')}` : ''}
                ${notSigned.length ? `${sectionLabel(`Not signed · ${count(notSigned)}`)}${panel(list(notSigned.map((r) => `${line(r)}: ${escapeHtml(r.reason)}`)), 'warn')}
                    ${paragraph("Cards that weren't signed come off your bill.")}` : ''}
                ${cta(participantLink(orderId), 'See your order')}`,
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

/** To a participant: their cards shipped back. */
export function returnShippedEmail({ orderId, orderName, tracking }: Base & { tracking: string }): GroupOrderEmail {
    return {
        subject: `Your cards are on the way back: ${orderName}`,
        html: renderEmail({
            title: 'Cards shipped back',
            preheader: `Tracking: ${escapeHtml(tracking)}`,
            eyebrow: 'Shipped back',
            heading: 'Your cards are on the way.',
            intro: `The organizer of <strong>${escapeHtml(orderName)}</strong> shipped your cards back.`,
            body: `${panel(`<strong>Tracking:</strong> ${escapeHtml(tracking)}`, 'info')}${cta(participantLink(orderId), 'See your order')}`,
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}

/** To admins: someone reported a group order. */
export function groupOrderReportEmail({ orderName, organizer, reporter, reason }: Base & { organizer: string; reporter: string; reason: string }): GroupOrderEmail {
    const adminLink = `${siteUrl()}/admin/group-orders`;
    return {
        subject: `Group order reported: ${orderName}`,
        html: renderEmail({
            title: 'Group order reported',
            preheader: `${escapeHtml(reporter)} reported a group order.`,
            eyebrow: 'Admin · report',
            heading: 'A group order was reported.',
            intro: `${escapeHtml(reporter)} reported <strong>${escapeHtml(orderName)}</strong>, organized by ${escapeHtml(organizer)}.`,
            body: `${sectionLabel('Their reason')}${panel(`<p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.55;">${escapeHtml(reason)}</p>`, 'warn')}
                ${cta(adminLink, 'Review group orders')}`,
            footer: '<p style="margin: 0;">You get these because you are an admin of MTG Artist Connection.</p>',
        }),
    };
}

/** To everyone in the order: the organizer cancelled it. */
export function cancelledEmail({ orderId, orderName }: Base): GroupOrderEmail {
    return {
        subject: `${orderName} was cancelled`,
        html: renderEmail({
            title: 'Order cancelled',
            preheader: 'The organizer cancelled this group order.',
            eyebrow: 'Cancelled',
            heading: 'This order was cancelled.',
            intro: `The organizer cancelled <strong>${escapeHtml(orderName)}</strong>. If you already sent cards or money, work out the return with them directly.`,
            body: cta(participantLink(orderId), 'See the order'),
            footer: footer(orderName, participantLink(orderId)),
        }),
    };
}
