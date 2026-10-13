import { escapeHtml } from './groupOrderEmails';

// The page behind a group order's "Copy link for Discord" link. Discord's crawler doesn't run
// JavaScript, so this serves the Open Graph tags it reads for the link preview, then sends real
// visitors on to the invite page with a meta refresh (inline scripts are blocked by our CSP).

export interface ShareSummary {
    name: string;
    organizerDiscordName: string;
    eventName: string | null;
    eventDates: string | null;
    artists: { name: string; remaining: number | null }[];
    cutoff: Date | null;
    status: string;
}

const MAX_ARTISTS_LISTED = 6;

const cutoffText = (cutoff: Date) =>
    cutoff.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });

/** The one-paragraph preview description: organizer, event, artists, cutoff and slots. */
export function shareDescription(order: ShareSummary): string {
    const parts: string[] = [];
    parts.push(order.organizerDiscordName ? `Run by ${order.organizerDiscordName} on Discord` : 'Group signing run');
    if (order.eventName) parts.push(order.eventDates ? `${order.eventName}, ${order.eventDates}` : order.eventName);

    const listed = order.artists.slice(0, MAX_ARTISTS_LISTED).map((a) =>
        a.remaining === null ? a.name : a.remaining === 0 ? `${a.name} (full)` : `${a.name} (${a.remaining} left)`);
    const more = order.artists.length - listed.length;
    if (listed.length) parts.push(`Artists: ${listed.join(', ')}${more > 0 ? ` +${more} more` : ''}`);

    if (order.status === 'open') parts.push(order.cutoff ? `Join by ${cutoffText(order.cutoff)}` : 'Taking join requests');
    else if (order.status === 'cancelled') parts.push('This order was cancelled');
    else parts.push('No longer taking new people');
    return parts.join(' · ');
}

const page = ({ title, description, url, joinUrl }: { title: string; description: string; url: string; joinUrl: string }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MTG Artist Connection">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="https://www.mtgartistconnection.com/logo.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#2d6a46">
<meta http-equiv="refresh" content="0; url=${escapeHtml(joinUrl)}">
</head>
<body style="font-family: system-ui, sans-serif; padding: 40px 16px; text-align: center;">
<p>${escapeHtml(title)}</p>
<p><a href="${escapeHtml(joinUrl)}">Open the group order</a></p>
</body>
</html>`;

export function groupOrderSharePage(order: ShareSummary, shareUrl: string, joinUrl: string): string {
    return page({ title: `${order.name} · Group order`, description: shareDescription(order), url: shareUrl, joinUrl });
}

/** For links to orders that don't exist, are drafts, or were turned off: still sends people on. */
export function inactiveSharePage(shareUrl: string, joinUrl: string): string {
    return page({
        title: 'Group order · MTG Artist Connection',
        description: "This invite link isn't active. Ask the organizer for the current link.",
        url: shareUrl,
        joinUrl,
    });
}
