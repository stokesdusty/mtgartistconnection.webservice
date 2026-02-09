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

app.use(cors());
app.use(authMiddleware);
app.use("/graphql", graphqlHTTP((req) => ({
    schema: schema,
    graphiql: true,
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
