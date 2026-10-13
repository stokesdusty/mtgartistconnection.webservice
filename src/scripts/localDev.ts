import fs from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { LOCAL_ACCOUNTS, LOCAL_INVITE_TOKEN, LOCAL_PASSWORD, seedLocalData } from './localSeed';

// `npm run dev:local`: the API on a throwaway MongoDB, for testing with the frontend's
// `npm run start:local`. It never uses MONGODB_URI, so it can't reach the real database;
// it doesn't run scheduled jobs; and it logs emails instead of sending them.
// Data lives in .local-db/ between runs. Delete that folder to start over.

const DB_PATH = path.resolve(__dirname, '../../.local-db');
const MONGO_PORT = 27018;   // not 27017, so it never collides with a real local MongoDB
const API_PORT = '8080';
// The frontend's `npm run start:local` runs on 3001, so local logins never mix with a normal `npm start` session.
const FRONTEND = 'http://localhost:3001';

async function main() {
    fs.mkdirSync(DB_PATH, { recursive: true });
    const mongo = await MongoMemoryServer.create({ instance: { dbPath: DB_PATH, port: MONGO_PORT, storageEngine: 'wiredTiger' } });
    const uri = mongo.getUri('mtgac-local');

    // Set before the app loads its .env, which never overrides variables that are already set.
    Object.assign(process.env, {
        MONGODB_URI: uri,
        PORT: API_PORT,
        NODE_ENV: 'development',
        CORS_ORIGIN: FRONTEND,
        FRONTEND_URL: FRONTEND,
        JWT_SECRET: 'local-dev-only-jwt-secret',
        REFRESH_TOKEN_SECRET: 'local-dev-only-refresh-secret',
        DISABLE_JOBS: 'true',
        DISABLE_EMAIL: 'true',
    });

    await mongoose.connect(uri);
    const seeded = await seedLocalData();
    await mongoose.disconnect();

    console.log(`\nLocal database: ${uri} (${seeded ? 'seeded with test data' : 'existing data kept'})`);
    console.log(`Every test account's password is "${LOCAL_PASSWORD}":`);
    for (const a of LOCAL_ACCOUNTS) console.log(`  ${a.email.padEnd(20)} ${a.note}`);
    console.log(`Sample invite link: ${FRONTEND}/tracker/join/${LOCAL_INVITE_TOKEN}`);
    console.log(`Its Discord preview page: http://localhost:${API_PORT}/share/group-order/${LOCAL_INVITE_TOKEN}`);
    console.log(`Run the frontend with \`npm run start:local\`. GraphiQL: http://localhost:${API_PORT}/graphql\n`);

    const stop = async () => {
        await mongo.stop({ doCleanup: false });
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../app');
}

main().catch((err) => {
    console.error('Local dev server failed to start:', err);
    process.exit(1);
});
