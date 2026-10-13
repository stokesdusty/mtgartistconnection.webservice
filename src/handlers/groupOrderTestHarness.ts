import { graphql } from 'graphql';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import schema from './handlers';
import User from '../models/User';
import SigningBatch from '../models/SigningBatch';
import GroupOrderParticipant from '../models/GroupOrderParticipant';

// Shared setup for the group order integration tests (`npm run test:integration`): a real
// MongoDB, three users, and helpers that run GraphQL operations through the real schema.

/** User ids, filled in once the database is up. */
export const users = { organizer: '', alice: '', bob: '' };

/** Starts a fresh MongoDB for the test file, and clears orders between tests. */
export function useTestDatabase() {
    let mongo: MongoMemoryServer;

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());
        await Promise.all([User.init(), SigningBatch.init(), GroupOrderParticipant.init()]);
        const make = (name: string, discordName = '') => User.create({ name, email: `${name}@test.local`, password: 'not-a-real-hash', discordName });
        const [organizer, alice, bob] = await Promise.all([make('runner', 'card.runner'), make('alice', 'alice.collects'), make('bob')]);
        Object.assign(users, { organizer: String(organizer._id), alice: String(alice._id), bob: String(bob._id) });
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongo.stop();
    });

    afterEach(async () => {
        await Promise.all([SigningBatch.deleteMany({}), GroupOrderParticipant.deleteMany({})]);
    });
}

/** Runs an operation as `userId` (or anonymously) and returns data, throwing the first GraphQL error. */
export async function run(source: string, variables: Record<string, unknown> = {}, userId?: string, userRole = 'user') {
    const result = await graphql({ schema, source, variableValues: variables, contextValue: { isAuthenticated: !!userId, userId, userRole } });
    if (result.errors?.length) throw new Error(result.errors[0].message);
    return result.data as any;
}

export const ORDER = `id name status savedStatus inviteToken privateInstructions
    artists { name cap used remaining }
    rows { rowId participantId artist signatureTypeId quantity cardName owner }
    participants { id displayName discordName status isGuest cardCount balance { due status pendingCount } }`;
export const MINE = `id status privateInstructions rows { rowId artist signatureTypeId quantity }
    artists { name used remaining } me { id status cardCount balance { cardsTotal due remaining status pendingCount } }`;

export const settings = (overrides: Record<string, unknown> = {}) => ({
    signatureTypes: [{ id: 'sig', label: 'Signature' }, { id: 'sketch', label: 'Sketch' }],
    artists: [
        { name: 'Rebecca Guay', cap: 3, prices: [{ signatureTypeId: 'sig', price: 5 }, { signatureTypeId: 'sketch', price: null }] },
        { name: 'Kaja Foglio', prices: [{ signatureTypeId: 'sig', price: 3 }] },
    ],
    participantFee: 2,
    paymentTiming: 'upfront',
    publicTerms: 'Back in 3 weeks.',
    privateInstructions: 'Ship to 123 Main Street.',
    ...overrides,
});

export const createOrder = async (overrides: Record<string, unknown> = {}) =>
    (await run(`mutation($s: GroupOrderSettingsInput!) { createGroupOrder(name: "IX run", settings: $s) { ${ORDER} } }`, { s: settings(overrides) }, users.organizer)).createGroupOrder;
export const setStatus = (orderId: string, status: string) =>
    run(`mutation($o: ID!, $s: String!) { setGroupOrderStatus(orderId: $o, status: $s) { ${ORDER} } }`, { o: orderId, s: status }, users.organizer);
export const invite = async (token: string, userId?: string) =>
    (await run(`query($t: String!) { groupOrderByInvite(token: $t) { id name status viewerStatus artists { name remaining } } }`, { t: token }, userId)).groupOrderByInvite;
export const join = async (token: string, userId: string, discordName: string | null = null) =>
    (await run(`mutation($t: String!, $d: String) { joinGroupOrder(token: $t, discordName: $d, acceptTerms: true) { ${MINE} } }`, { t: token, d: discordName }, userId)).joinGroupOrder;
export const organizerView = async (orderId: string) =>
    (await run(`query($o: ID!) { organizedGroupOrder(orderId: $o) { ${ORDER} } }`, { o: orderId }, users.organizer)).organizedGroupOrder;
export const myView = async (orderId: string, userId: string) =>
    (await run(`query($o: ID!) { myGroupOrder(orderId: $o) { ${MINE} } }`, { o: orderId }, userId)).myGroupOrder;
export const review = (participantId: string, approve: boolean) =>
    run(`mutation($p: ID!, $a: Boolean!) { reviewGroupOrderRequest(participantId: $p, approve: $a) { ${ORDER} } }`, { p: participantId, a: approve }, users.organizer);
export const addCard = async (orderId: string, userId: string, row: Record<string, unknown>) =>
    (await run(`mutation($o: ID!, $r: GroupOrderRowInput!) { addGroupOrderRow(orderId: $o, row: $r) { ${MINE} } }`, { o: orderId, r: row }, userId)).addGroupOrderRow;

/** An open order with alice approved. */
export async function openOrderWithAlice(overrides: Record<string, unknown> = {}) {
    const order = await createOrder(overrides);
    await setStatus(order.id, 'open');
    const mine = await join(order.inviteToken, users.alice);
    await review(mine.me.id, true);
    return { order, aliceId: mine.me.id as string };
}
