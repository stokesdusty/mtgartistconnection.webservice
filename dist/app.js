"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = require("dotenv");
const connection_1 = require("./utils/connection");
const express_graphql_1 = require("express-graphql");
const handlers_1 = __importDefault(require("./handlers/handlers"));
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron"));
const priceSyncService_1 = require("./services/priceSyncService");
const cardKingdomPriceSync_1 = require("./services/cardKingdomPriceSync");
const auth_1 = require("./middleware/auth");
const dailyDigest_1 = require("./jobs/dailyDigest");
const dailyEventDigest_1 = require("./jobs/dailyEventDigest");
const scryfallArtistSync_1 = require("./jobs/scryfallArtistSync");
// Dotenv config
(0, dotenv_1.config)();
const app = (0, express_1.default)();
// Configure CORS with whitelist of allowed origins
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
    : [];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
        if (!origin)
            return callback(null, true);
        // Check if the origin is in the whitelist
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.log(`CORS Blocked Origin: ${origin}`); // Log the blocked origin for debugging
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies/auth headers
}));
app.use(auth_1.authMiddleware);
app.use("/graphql", (0, express_graphql_1.graphqlHTTP)((req) => ({
    schema: handlers_1.default,
    graphiql: process.env.NODE_ENV !== 'production', // Only enable in development
    context: {
        isAuthenticated: req.isAuthenticated,
        userId: req.userId,
        userRole: req.userRole
    }
})));
(0, connection_1.connectToDatabase)()
    .then(() => {
    // Start the daily price sync schedulers
    (0, priceSyncService_1.startPriceSyncScheduler)();
    (0, cardKingdomPriceSync_1.startCardKingdomPriceSyncScheduler)();
    // Start the daily digest schedulers
    // Run artist digest daily at 8 PM (20:00) in server timezone
    node_cron_1.default.schedule('0 20 * * *', async () => {
        console.log('Triggering daily artist digest job...');
        try {
            await (0, dailyDigest_1.runDailyDigest)();
        }
        catch (error) {
            console.error('Daily artist digest job failed:', error);
        }
    });
    console.log('Daily artist digest cron job scheduled for 8 PM daily');
    // Run event digest daily at 8 PM (20:00) in server timezone
    node_cron_1.default.schedule('0 20 * * *', async () => {
        console.log('Triggering daily event digest job...');
        try {
            await (0, dailyEventDigest_1.runDailyEventDigest)();
        }
        catch (error) {
            console.error('Daily event digest job failed:', error);
        }
    });
    console.log('Daily event digest cron job scheduled for 8 PM daily');
    // Run Scryfall artist sync daily at 4 PM PST (midnight UTC)
    node_cron_1.default.schedule('0 0 * * *', async () => {
        console.log('Triggering Scryfall artist sync job...');
        try {
            await (0, scryfallArtistSync_1.runScryfallArtistSync)();
        }
        catch (error) {
            console.error('Scryfall artist sync job failed:', error);
        }
    });
    console.log('Scryfall artist sync cron job scheduled for 4 PM PST daily');
    return app.listen(process.env.PORT, () => console.log(`Server Open on Port ${process.env.PORT}`));
})
    .catch(err => console.log(err));
//# sourceMappingURL=app.js.map