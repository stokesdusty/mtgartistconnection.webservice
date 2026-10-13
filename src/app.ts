import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { config } from 'dotenv';
import { connectToDatabase } from './utils/connection';
import { graphqlHTTP } from 'express-graphql';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import schema from "./handlers/handlers";
import cors from "cors";
import cron from 'node-cron';
import { startPriceSyncScheduler } from './services/priceSyncService';
import { startCardKingdomPriceSyncScheduler } from './services/cardKingdomPriceSync';
import { authMiddleware } from './middleware/auth';
import { graphqlRateLimiter } from './middleware/rateLimiter';
import { runDailyDigest } from './jobs/dailyDigest';
import { runDailyEventDigest } from './jobs/dailyEventDigest';
import { runScryfallArtistSync } from './jobs/scryfallArtistSync';
import { runSetArtistSync } from './jobs/setArtistSync';
import SetArtists from './models/SetArtists';
import { runDailyNewArtistDigest } from './jobs/dailyNewArtistDigest';
import { runMountainMageSync } from './jobs/mountainMageSync';
import { runGroupOrderCutoffReminders } from './jobs/groupOrderCutoffReminders';
// import { runMarksSignatureSync } from './jobs/marksSignatureSync'; // cron disabled below
import sitemapRouter from './routes/sitemap';
import publicArtistRouter from './routes/publicArtist';
import publicArtistsRouter from './routes/publicArtists';
import groupOrderShareRouter from './routes/groupOrderShare';

// Dotenv config
config();

const app = express();

// Railway terminates requests at one proxy hop; trust it so req.ip (used by
// the rate limiters) is the real client IP rather than the proxy's.
app.set('trust proxy', 1);

app.use(compression());

// Auth only reads the Authorization header, so it can run before body parsing
// and let the parser pick a size limit by role.
app.use(authMiddleware);

// Admins get a 10MB limit for base64 image uploads; everyone else gets 1MB.
const adminJsonParser = express.json({ limit: '10mb' });
const defaultJsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) =>
    ((req as any).userRole === 'admin' ? adminJsonParser : defaultJsonParser)(req, res, next)
);
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Configure CORS with whitelist of allowed origins
const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) 
    : [];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
        if (!origin) return callback(null, true);

        // Check if the origin is in the whitelist
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log(`CORS Blocked Origin: ${origin}`); // Log the blocked origin for debugging
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies/auth headers
}));
app.use(helmet());

// Rate-limit login/signup attempts (brute-force and credential stuffing) and group order
// invite lookups (token guessing) on /graphql, without throttling other operations.
app.use('/graphql', graphqlRateLimiter);

app.use('/graphql', (req, res, next) => {
    const isMutation = req.body?.query?.trimStart().startsWith('mutation');
    res.setHeader(
        'Cache-Control',
        isMutation ? 'no-store' : 'private, max-age=60, stale-while-revalidate=300'
    );
    next();
});

app.use('/sitemap.xml', sitemapRouter);
app.use('/api/public/artist', publicArtistRouter);
app.use('/api/public/artists', publicArtistsRouter);
app.use('/share/group-order', groupOrderShareRouter);

app.get('/.well-known/security.txt', (_req, res) => {
    res.type('text/plain');
    res.send(
`Contact: mailto:stokes.dusty@gmail.com
Expires: ${new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('.')[0]}Z
Preferred-Languages: en
`
    );
});

app.use("/graphql", graphqlHTTP((req) => ({
    schema: schema,
    graphiql: process.env.NODE_ENV !== 'production', // Only enable in development
    validationRules: process.env.NODE_ENV === 'production'
        ? [NoSchemaIntrospectionCustomRule]
        : [],
    context: {
        isAuthenticated: (req as any).isAuthenticated,
        userId: (req as any).userId,
        userRole: (req as any).userRole
    }
})));

// Every scheduled job: price syncs, data syncs, and the digests that email users.
const scheduleJobs = () => {
    // Start the daily price sync schedulers
    startPriceSyncScheduler();
    startCardKingdomPriceSyncScheduler();

    // Start the daily digest schedulers
    // Run artist digest daily at 8 PM (20:00) in server timezone
    cron.schedule('0 20 * * *', async () => {
        console.log('Triggering daily artist digest job...');
        try {
            await runDailyDigest();
        } catch (error) {
            console.error('Daily artist digest job failed:', error);
        }
    });
    console.log('Daily artist digest cron job scheduled for 8 PM daily');

    // Run event digest daily at 8 PM (20:00) in server timezone
    cron.schedule('0 20 * * *', async () => {
        console.log('Triggering daily event digest job...');
        try {
            await runDailyEventDigest();
        } catch (error) {
            console.error('Daily event digest job failed:', error);
        }
    });
    console.log('Daily event digest cron job scheduled for 8 PM daily');

    // Run Scryfall artist sync daily at 4 PM PST (midnight UTC)
    cron.schedule('0 0 * * *', async () => {
        console.log('Triggering Scryfall artist sync job...');
        try {
            await runScryfallArtistSync();
        } catch (error) {
            console.error('Scryfall artist sync job failed:', error);
        }
        // Refresh the set → artists index for the homepage "Set" filter
        try {
            await runSetArtistSync();
        } catch (error) {
            console.error('Set artist sync job failed:', error);
        }
    });
    console.log('Scryfall artist sync + set artist sync cron job scheduled for 4 PM PST daily');

    // First deploy: build the set index now instead of waiting for midnight.
    SetArtists.estimatedDocumentCount()
        .then(count => (count === 0 ? runSetArtistSync() : undefined))
        .catch(error => console.error('Initial set artist sync failed:', error));

    // Run new artist digest daily at 8 PM (20:00) in server timezone
    cron.schedule('0 20 * * *', async () => {
        console.log('Triggering daily new artist digest job...');
        try {
            await runDailyNewArtistDigest();
        } catch (error) {
            console.error('Daily new artist digest job failed:', error);
        }
    });
    console.log('Daily new artist digest cron job scheduled for 8 PM daily');

    // Run Mountain Mage Signatures sync daily at 5 AM UTC
    cron.schedule('0 5 * * *', async () => {
        console.log('Triggering Mountain Mage sync job...');
        try {
            await runMountainMageSync();
        } catch (error) {
            console.error('Mountain Mage sync job failed:', error);
        }
    });
    console.log('Mountain Mage sync cron job scheduled for 5 AM UTC daily');

    // Group order cutoff reminders, checked hourly so each lands about 48 hours ahead
    cron.schedule('0 * * * *', async () => {
        try {
            await runGroupOrderCutoffReminders();
        } catch (error) {
            console.error('Group order cutoff reminder job failed:', error);
        }
    });
    console.log('Group order cutoff reminder cron job scheduled hourly');

    // Disabled until the job can isolate upcoming artists from Mark's post
    // // Run Mark's Signature Service sync daily at 10 AM Pacific (DST-aware)
    // cron.schedule('0 10 * * *', async () => {
    //     console.log("Triggering Mark's Signature Service sync job...");
    //     try {
    //         await runMarksSignatureSync();
    //     } catch (error) {
    //         console.error("Mark's Signature Service sync job failed:", error);
    //     }
    // }, { timezone: 'America/Los_Angeles' });
    // console.log("Mark's Signature Service sync cron job scheduled for 10 AM Pacific daily");
};

connectToDatabase()
    .then(() => {
        // Local testing (npm run dev:local) turns these off so nothing emails users or calls partner APIs.
        if (process.env.DISABLE_JOBS === 'true') console.log('Scheduled jobs are off (DISABLE_JOBS=true)');
        else scheduleJobs();

        return app.listen(process.env.PORT,
        () => console.log(`Server Open on Port ${process.env.PORT}`)
    );
})
.catch(err=>console.log(err));
