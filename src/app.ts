import express from 'express';
import { config } from 'dotenv';
import { connectToDatabase } from './utils/connection';
import { graphqlHTTP } from 'express-graphql';
import schema from "./handlers/handlers";
import cors from "cors";
import { startPriceSyncScheduler } from './services/priceSyncService';
import { authMiddleware } from './middleware/auth';

// Dotenv config
config();

const app = express();

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
        // Start the daily price sync scheduler
        startPriceSyncScheduler();

        return app.listen(process.env.PORT,
        () => console.log(`Server Open on Port ${process.env.PORT}`)
    );
})
.catch(err=>console.log(err));
