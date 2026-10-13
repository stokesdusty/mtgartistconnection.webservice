import { LOCAL_ACCOUNTS, LOCAL_INVITE_TOKEN, seedLocalData } from './localSeed';
import Artist from '../models/Artist';
import MapArtistToEvent from '../models/MapArtistToEvent';
import SigningEvent from '../models/SigningEvent';
import User from '../models/User';
import { invite, run, useTestDatabase } from '../handlers/groupOrderTestHarness';

// The `npm run dev:local` seed loads cleanly and gives each test account what the README
// promises. Runs on its own temporary database, never the local one in .local-db/.

useTestDatabase();

const login = async (email: string) => String((await User.findOne({ email }).lean())!._id);

describe('local seed', () => {
    // The harness clears orders after each test and makes its own users; the seed only runs
    // on an empty database, so start each test from nothing.
    beforeEach(async () => {
        await Promise.all([User.deleteMany({}), Artist.deleteMany({}), SigningEvent.deleteMany({}), MapArtistToEvent.deleteMany({})]);
        expect(await seedLocalData()).toBe(true);
    });

    it('creates every account, including an admin, and only seeds once', async () => {
        expect(await User.countDocuments()).toBe(LOCAL_ACCOUNTS.length);
        expect((await User.findOne({ email: 'admin@test.local' }).lean())?.role).toBe('admin');
        expect(await seedLocalData()).toBe(false);
    });

    it('has an open order behind the sample invite link', async () => {
        expect(await invite(LOCAL_INVITE_TOKEN)).toMatchObject({ name: 'Local Test Con signing run', status: 'open' });
    });

    it('gives the organizer a request, a payment to confirm, and an at-event order to work', async () => {
        const runner = await login('runner@test.local');
        const orders = (await run(`{ organizedGroupOrders { name status participants { discordName status mismatchCount
            payments { confirmedAt } customItems { status } balance { status } } } }`, {}, runner)).organizedGroupOrders;
        const open = orders.find((o: any) => o.status === 'open');
        const atEvent = orders.find((o: any) => o.status === 'at-event');

        expect(open.participants.map((p: any) => p.status).sort()).toEqual(['approved', 'requested']);
        const aliceOpen = open.participants.find((p: any) => p.discordName === 'alice.collects');
        expect(aliceOpen.payments).toEqual([{ confirmedAt: null }]);
        expect(aliceOpen.balance.status).toBe('pending');   // the AP has no price yet

        expect(atEvent.participants.find((p: any) => p.discordName === 'casey.signs')).toMatchObject({ mismatchCount: 1 });
    });

    it("shows Alice both orders she's in", async () => {
        const alice = await login('alice@test.local');
        const mine = (await run(`{ myGroupOrders { name me { status } } }`, {}, alice)).myGroupOrders;
        expect(mine.map((o: any) => o.name).sort()).toEqual(['Local Test Con signing run', 'Second Test Show run']);
    });
});
