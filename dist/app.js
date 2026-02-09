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
const priceSyncService_1 = require("./services/priceSyncService");
const auth_1 = require("./middleware/auth");
// Dotenv config
(0, dotenv_1.config)();
const app = (0, express_1.default)();
// Configure CORS with whitelist of allowed origins
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
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
    // Start the daily price sync scheduler
    (0, priceSyncService_1.startPriceSyncScheduler)();
    return app.listen(process.env.PORT, () => console.log(`Server Open on Port ${process.env.PORT}`));
})
    .catch(err => console.log(err));
//# sourceMappingURL=app.js.map