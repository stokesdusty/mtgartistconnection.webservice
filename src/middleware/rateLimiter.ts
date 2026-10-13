import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { isIP } from 'net';
import { parse, visit, BREAK } from 'graphql';

/**
 * The visitor's address for requests that came through Amplify's CloudFront (the
 * www.mtgartistconnection.com/join/<token> rewrite). CloudFront adds the visitor's IP to
 * X-Forwarded-For, then Railway adds CloudFront's, so with one trusted hop req.ip is the
 * CloudFront edge that many visitors share. This takes the hop before it instead.
 * Anything unexpected falls back to req.ip.
 */
export function proxiedVisitorIp(req: Pick<Request, 'ip' | 'headers'>): string {
    const fallback = req.ip ?? '';
    // CloudFront sets this on every request it forwards.
    if (!req.headers['x-amz-cf-id']) return fallback;
    const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((hop) => hop.trim()).filter(Boolean);
    // The last hop is CloudFront itself (what Express already took as req.ip); the one before is the visitor.
    if (hops.length < 2 || hops[hops.length - 1] !== fallback) return fallback;
    const visitor = hops[hops.length - 2];
    return isIP(visitor) ? visitor : fallback;
}

const AUTH_FIELDS = new Set(['login', 'signup']);
// Group order invite links are the only thing guarding an order's public page, so
// lookups by token are throttled to make guessing tokens impractical.
const INVITE_FIELDS = new Set(['groupOrderByInvite', 'joinGroupOrder']);

const tooMany = (_req: Request, res: Response) => {
    res.status(429).json({ errors: [{ message: 'Too many requests. Please try again later.' }] });
};

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login/signup attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany,
});

const inviteRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60, // invite pages poll and get reopened, so this is looser than login
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany,
});

// Parses the query rather than pattern-matching its text, so comments,
// aliases, fragments or odd whitespace can't hide a call to one of `fields`.
export const usesField = (query: string, fields: Set<string>): boolean => {
    let found = false;
    try {
        visit(parse(query), {
            Field(node) {
                if (fields.has(node.name.value)) {
                    found = true;
                    return BREAK;
                }
            },
        });
    } catch {
        // Unparseable queries are rejected by graphqlHTTP before any resolver runs
        return false;
    }
    return found;
};

export const isAuthOperation = (query: string): boolean => usesField(query, AUTH_FIELDS);
export const isInviteOperation = (query: string): boolean => usesField(query, INVITE_FIELDS);

// Only rate-limits GraphQL requests calling login/signup or looking up an invite
// token, so other queries and mutations on /graphql are unaffected.
export const graphqlRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';

    if (query && isAuthOperation(query)) {
        return authRateLimiter(req, res, next);
    }
    if (query && isInviteOperation(query)) {
        return inviteRateLimiter(req, res, next);
    }

    next();
};
