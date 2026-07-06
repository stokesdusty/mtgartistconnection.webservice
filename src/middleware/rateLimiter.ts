import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Matches GraphQL mutations invoking the login or signup resolvers, e.g.
// `mutation { login(...) }` or `mutation Login { login(...) }`.
const AUTH_OPERATION_REGEX = /\b(login|signup)\s*\(/;

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login/signup attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ errors: [{ message: 'Too many requests. Please try again later.' }] });
    },
});

// Only rate-limits GraphQL requests calling login/signup, so other queries
// and mutations on /graphql are unaffected.
export const graphqlAuthRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';

    if (AUTH_OPERATION_REGEX.test(query)) {
        return authRateLimiter(req, res, next);
    }

    next();
};
