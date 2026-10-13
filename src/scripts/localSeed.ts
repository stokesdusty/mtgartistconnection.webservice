import { randomUUID } from 'crypto';
import { hashSync } from 'bcryptjs';
import { Types } from 'mongoose';
import Artist from '../models/Artist';
import GroupOrderParticipant from '../models/GroupOrderParticipant';
import MapArtistToEvent from '../models/MapArtistToEvent';
import SigningBatch from '../models/SigningBatch';
import SigningEvent from '../models/SigningEvent';
import User from '../models/User';

// Test data for `npm run dev:local`. Only ever runs against the throwaway local database.

export const LOCAL_PASSWORD = 'password123';
export const LOCAL_INVITE_TOKEN = 'local-test-invite';

export const LOCAL_ACCOUNTS = [
    { name: 'Runner', email: 'runner@test.local', discordName: 'card.runner', role: 'user', note: 'organizes both sample orders' },
    { name: 'Alice', email: 'alice@test.local', discordName: 'alice.collects', role: 'user', note: 'in both orders: cards, a payment to confirm, an item request' },
    { name: 'Bob', email: 'bob@test.local', discordName: '', role: 'user', note: 'asked to join the open order, no Discord name' },
    { name: 'Casey', email: 'casey@test.local', discordName: 'casey.signs', role: 'user', note: 'in the event-day order, package checked in with a miscount' },
    { name: 'Admin', email: 'admin@test.local', discordName: '', role: 'admin', note: 'admin: /admin/group-orders' },
];

const ARTISTS = ['Rebecca Guay', 'Kaja Foglio', 'Seb McKinnon', 'Mark Tedin', 'Christopher Rush', 'Terese Nielsen'];

// Events store dates the way the admin form does (Day.js toString(), a UTC date string).
const daysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d.toUTCString();
};

const card = (participantId: Types.ObjectId, owner: string, artist: string, signatureTypeId: string, quantity: number, cardName: string, extra: Record<string, unknown> = {}) => ({
    rowId: randomUUID(), cardName, quantity, artist, signatureTypeId, participantId, owner, status: 'collecting', signingMethod: 'event', ...extra,
});

const SIGNATURE_TYPES = [{ id: 'sig', label: 'Signature' }, { id: 'doodle', label: 'Sig + doodle' }, { id: 'sketch', label: 'Sketch' }];

/** Seeds an empty database. Returns false (and changes nothing) if there are already users. */
export async function seedLocalData(): Promise<boolean> {
    if (await User.estimatedDocumentCount()) return false;

    const password = hashSync(LOCAL_PASSWORD);
    const [runner, alice, bob, casey] = await User.insertMany(LOCAL_ACCOUNTS.map(({ name, email, discordName, role }) => ({ name, email, discordName, role, password })));
    await Artist.insertMany(ARTISTS.map((name) => ({ name })));

    const [con, show] = await SigningEvent.insertMany([
        { name: 'Local Test Con', city: 'Sacramento', state: 'CA', startDate: daysFromNow(21), endDate: daysFromNow(23), url: 'https://example.com' },
        { name: 'Second Test Show', city: 'Reno', state: 'NV', startDate: daysFromNow(0), endDate: daysFromNow(1), url: null },
    ]);
    await MapArtistToEvent.insertMany(ARTISTS.slice(0, 4).map((artistName) => ({ artistName, eventId: String(con._id) })));

    // 1. An open order: Alice is in with cards, a payment to confirm and an item request; Bob is waiting for approval.
    const open = await SigningBatch.create({
        userId: runner._id,
        batchId: `group-${randomUUID()}`,
        name: 'Local Test Con signing run',
        createdAt: new Date().toISOString(),
        groupOrder: {
            status: 'open',
            eventId: con._id,
            signatureTypes: SIGNATURE_TYPES,
            artists: [
                { name: 'Rebecca Guay', cap: 10, prices: [{ signatureTypeId: 'sig', price: 5 }, { signatureTypeId: 'doodle', price: 15 }, { signatureTypeId: 'sketch', price: null }] },
                { name: 'Kaja Foglio', cap: null, prices: [{ signatureTypeId: 'sig', price: 3 }, { signatureTypeId: 'sketch', price: 40 }] },
                { name: 'Seb McKinnon', cap: 4, prices: [{ signatureTypeId: 'sig', price: 10 }] },
            ],
            participantFee: 2,
            returnOptions: [{ id: 'pwe', label: 'Plain envelope', price: 1 }, { id: 'bmwt', label: 'Bubble mailer with tracking', price: 5 }],
            cutoff: new Date(Date.now() + 14 * 86_400_000),
            maxCardsPerParticipant: 20,
            paymentTiming: 'upfront',
            inviteToken: LOCAL_INVITE_TOKEN,
            publicTerms: 'Cards back within 3 weeks of the show. If an artist cancels, those cards come back unsigned and are refunded.',
            privateInstructions: 'Ship to: Runner, 123 Test Street, Sacramento CA 95814.\nPay: Venmo @card-runner (friends & family).',
            organizerDiscordName: 'card.runner',
        },
    });
    const [aliceOpen] = await GroupOrderParticipant.insertMany([
        {
            orderId: open._id, userId: alice._id, displayName: 'Alice', discordName: 'alice.collects', status: 'approved', termsAcceptedAt: new Date(),
            notesToOrganizer: 'Could you grab a Guay artist proof of Gaea\'s Liege if she has them?',
            payments: [{ id: randomUUID(), amount: 20, note: 'Venmo, ends 4417', source: 'participant', recordedBy: alice._id, createdAt: new Date(), confirmedAt: null }],
            customItems: [{ id: randomUUID(), label: "Gaea's Liege AP", artistName: 'Rebecca Guay', quantity: 1, price: null, status: 'requested', note: '' }],
        },
        { orderId: open._id, userId: bob._id, displayName: 'Bob', discordName: '', status: 'requested', termsAcceptedAt: new Date() },
    ]);
    await SigningBatch.updateOne({ _id: open._id }, {
        $push: { rows: { $each: [
            card(aliceOpen._id, 'alice.collects', 'Rebecca Guay', 'sig', 2, "Gaea's Liege"),
            card(aliceOpen._id, 'alice.collects', 'Kaja Foglio', 'sketch', 1, 'Mana Vault'),
        ] } },
        $set: { 'groupOrder.rowsVersion': 1 },
    });

    // 2. An order at the event today, for the by-artist view: some cards signed, one not, one to buy.
    const atEvent = await SigningBatch.create({
        userId: runner._id,
        batchId: `group-${randomUUID()}`,
        name: 'Second Test Show run',
        createdAt: new Date().toISOString(),
        groupOrder: {
            status: 'at-event',
            eventId: show._id,
            signatureTypes: SIGNATURE_TYPES.slice(0, 2),
            artists: [
                { name: 'Mark Tedin', cap: null, prices: [{ signatureTypeId: 'sig', price: 4 }, { signatureTypeId: 'doodle', price: 12 }] },
                { name: 'Christopher Rush', cap: 6, prices: [{ signatureTypeId: 'sig', price: 6 }] },
            ],
            participantFee: 0,
            returnOptions: [{ id: 'pwe', label: 'Plain envelope', price: 1 }],
            cutoff: new Date(Date.now() - 7 * 86_400_000),
            maxCardsPerParticipant: null,
            paymentTiming: 'after-signing',
            inviteToken: 'local-event-invite',
            publicTerms: 'Pay after signing, before I ship back.',
            privateInstructions: 'Ship to: Runner, 123 Test Street, Sacramento CA 95814.',
            organizerDiscordName: 'card.runner',
        },
    });
    const received = new Date(Date.now() - 3 * 86_400_000);
    const [aliceEvent, caseyEvent] = await GroupOrderParticipant.insertMany([
        { orderId: atEvent._id, userId: alice._id, displayName: 'Alice', discordName: 'alice.collects', status: 'approved', termsAcceptedAt: new Date(), readyToShipAt: received, receivedAt: received },
        {
            orderId: atEvent._id, userId: casey._id, displayName: 'Casey', discordName: 'casey.signs', status: 'approved', termsAcceptedAt: new Date(),
            readyToShipAt: received, receivedAt: received, returnOptionId: 'pwe',
            customItems: [{ id: randomUUID(), label: 'Lightning Bolt AP', artistName: 'Christopher Rush', quantity: 2, price: 15, status: 'requested', note: '' }],
        },
    ]);
    await SigningBatch.updateOne({ _id: atEvent._id }, {
        $push: { rows: { $each: [
            card(aliceEvent._id, 'alice.collects', 'Mark Tedin', 'sig', 3, 'Sol Ring', { status: 'signed', receivedQuantity: 3 }),
            card(aliceEvent._id, 'alice.collects', 'Christopher Rush', 'sig', 1, 'Lightning Bolt', { receivedQuantity: 1 }),
            card(caseyEvent._id, 'casey.signs', 'Mark Tedin', 'doodle', 1, 'Time Walk', { receivedQuantity: 1 }),
            // Casey listed 2 but only 1 arrived.
            card(caseyEvent._id, 'casey.signs', 'Christopher Rush', 'sig', 2, 'Ancestral Recall', { receivedQuantity: 1 }),
            card(caseyEvent._id, 'casey.signs', 'Mark Tedin', 'sig', 1, 'Mox Sapphire', { status: 'not-signed', notSignedReason: 'Artist limit reached', receivedQuantity: 1 }),
        ] } },
        $set: { 'groupOrder.rowsVersion': 1 },
    });

    return true;
}
