import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { parse, visit, BREAK } from 'graphql';

const AUTH_FIELDS = new Set(['login', 'signup']);

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login/signup attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ errors: [{ message: 'Too many requests. Please try again later.' }] });
    },
});

// Parses the query rather than pattern-matching its text, so comments,
// aliases, fragments or odd whitespace can't hide a login/signup call.
export const isAuthOperation = (query: string): boolean => {
    let found = false;
    try {
        visit(parse(query), {
            Field(node) {
                if (AUTH_FIELDS.has(node.name.value)) {
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

// Only rate-limits GraphQL requests calling login/signup, so other queries
// and mutations on /graphql are unaffected.
export const graphqlAuthRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';

    if (query && isAuthOperation(query)) {
        return authRateLimiter(req, res, next);
    }

    next();
};
