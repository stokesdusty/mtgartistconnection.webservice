export const SITE_URL = 'https://www.mtgartistconnection.com';

/**
 * Base URL for links into the site: FRONTEND_URL (e.g. localhost for `npm run dev:local`), else
 * SITE_URL. The bare domain doesn't open deep links, so it's always rewritten to https://www.
 */
export const publicSiteUrl = (): string =>
    (process.env.FRONTEND_URL || SITE_URL)
        .trim()
        .replace(/\/+$/, '')
        .replace(/^https?:\/\/(www\.)?mtgartistconnection\.com(?=$|[/:])/i, SITE_URL);
