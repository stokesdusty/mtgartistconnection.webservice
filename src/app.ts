import express from 'express';
import { config } from 'dotenv';
import { connectToDatabase } from './utils/connection';
import { graphqlHTTP } from 'express-graphql';
import schema from "./handlers/handlers";
import cors from "cors";
import cron from 'node-cron';
import { startPriceSyncScheduler } from './services/priceSyncService';
import { startCardKingdomPriceSyncScheduler } from './services/cardKingdomPriceSync';
import { authMiddleware } from './middleware/auth';
import { runDailyDigest } from './jobs/dailyDigest';
import { runDailyEventDigest } from './jobs/dailyEventDigest';
import { runScryfallArtistSync } from './jobs/scryfallArtistSync';
import { runDailyNewArtistDigest } from './jobs/dailyNewArtistDigest';
import { runSocialMediaSync } from './jobs/socialMediaSync';

// Dotenv config
config();

const app = express();

// Increase body size limit for base64 image uploads (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
app.use(authMiddleware);
app.use("/graphql", graphqlHTTP((req) => ({
    schema: schema,
    graphiql: process.env.NODE_ENV !== 'production', // Only enable in development
    context: {
        isAuthenticated: (req as any).isAuthenticated,
        userId: (req as any).userId,
        userRole: (req as any).userRole
    }
})));

connectToDatabase()
    .then(() => {
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
        });
        console.log('Scryfall artist sync cron job scheduled for 4 PM PST daily');

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

        // For local testing: Trigger one sync batch immediately on startup
        if (process.env.NODE_ENV !== 'production') {
            console.log('Local environment detected: Triggering initial social media sync...');
            runSocialMediaSync().catch(err => console.error('Initial sync failed:', err));
        }

        // Run Social Media sync every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            console.log('Triggering social media sync batch...');
            try {
                await runSocialMediaSync();
            } catch (error) {
                console.error('Social media sync job failed:', error);
            }
        });
        console.log('Social media sync cron job scheduled for every 5 minutes');

        return app.listen(process.env.PORT,
        () => console.log(`Server Open on Port ${process.env.PORT}`)
    );
})
.catch(err=>console.log(err));
