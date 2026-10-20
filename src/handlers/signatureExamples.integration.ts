import Artist from '../models/Artist';
import User from '../models/User';
import { deleteImage, uploadImageFromBase64 } from '../services/s3UploadService';
import { run, users, useTestDatabase } from './groupOrderTestHarness';

jest.mock('../services/s3UploadService', () => {
    let n = 0;
    return {
        CDN_BASE_URL: 'https://cdn.test',
        uploadImageFromBase64: jest.fn(async (_data: string, _name: string, _type: string, { prefix }: { prefix: string }) => {
            const key = `${prefix}/${++n}.jpg`;
            return { key, imageUrl: `https://cdn.test/${key}` };
        }),
        deleteImage: jest.fn(async () => true),
    };
});

useTestDatabase();

const FIELDS = `signatureExamples { id imageUrl label }`;
let artistId = '';

beforeEach(async () => {
    const artist = await Artist.create({ name: 'Rebecca Guay', filename: 'guay', haveSignature: 'true' });
    artistId = String(artist._id);
    // alice is the verified artist; bob is just a user.
    await User.updateOne({ _id: users.alice }, { isVerifiedArtist: true, artistId: artist._id });
});

afterEach(async () => {
    await Artist.deleteMany({});
    jest.clearAllMocks();
});

const list = async () => (await run(`query($n: String!) { artistByName(name: $n) { ${FIELDS} } }`, { n: 'Rebecca Guay' })).artistByName.signatureExamples;
const add = async (label: string, userId: string | undefined = users.alice, role = 'user') =>
    (await run(`mutation($a: ID!, $l: String!) { addSignatureExample(artistId: $a, base64Data: "AAAA", contentType: "image/jpeg", label: $l) { ${FIELDS} } }`,
        { a: artistId, l: label }, userId, role)).addSignatureExample.signatureExamples;

describe('signature examples', () => {
    it('shows the legacy image until examples are added, then keeps it as the first one', async () => {
        expect(await list()).toEqual([{ id: 'legacy-guay', imageUrl: 'https://cdn.test/signatures/guay.jpg', label: 'Signature' }]);

        const examples = await add('  Sketch ');
        expect(examples.map((e: any) => e.label)).toEqual(['Signature', 'Sketch']);
        expect(examples[1].imageUrl).toBe(`https://cdn.test/signatures/${artistId}/1.jpg`);
        expect(uploadImageFromBase64).toHaveBeenCalledWith('AAAA', 'signature', 'image/jpeg', expect.objectContaining({ prefix: `signatures/${artistId}` }));
    });

    it('lets admins manage any artist but not other users', async () => {
        await expect(add('Regular', users.organizer, 'admin')).resolves.toHaveLength(2);
        await expect(add('Regular', users.bob)).rejects.toThrow(/access/);
        await expect(run(`mutation($a: ID!) { addSignatureExample(artistId: $a, base64Data: "AAAA", contentType: "image/jpeg", label: "Regular") { id } }`,
            { a: artistId })).rejects.toThrow();
    });

    it('renames, reorders and removes, deleting only uploaded files', async () => {
        const [legacy, sketch] = await add('Sketch');

        const renamed = (await run(`mutation($a: ID!, $e: ID!) { updateSignatureExample(artistId: $a, exampleId: $e, label: "Shadow") { ${FIELDS} } }`,
            { a: artistId, e: sketch.id }, users.alice)).updateSignatureExample.signatureExamples;
        expect(renamed.map((e: any) => e.label)).toEqual(['Signature', 'Shadow']);

        const reordered = (await run(`mutation($a: ID!, $ids: [ID!]!) { reorderSignatureExamples(artistId: $a, exampleIds: $ids) { ${FIELDS} } }`,
            { a: artistId, ids: [sketch.id, legacy.id] }, users.alice)).reorderSignatureExamples.signatureExamples;
        expect(reordered.map((e: any) => e.label)).toEqual(['Shadow', 'Signature']);

        const remove = (id: string) => run(`mutation($a: ID!, $e: ID!) { removeSignatureExample(artistId: $a, exampleId: $e) { ${FIELDS} } }`,
            { a: artistId, e: id }, users.alice);
        await remove(legacy.id);
        expect(deleteImage).not.toHaveBeenCalled();
        await remove(sketch.id);
        expect(deleteImage).toHaveBeenCalledWith(sketch.imageUrl);
        // Removing the old image cleared haveSignature, so it doesn't come back.
        expect(await list()).toEqual([]);
    });

    it('can remove the legacy image before anything is uploaded', async () => {
        await run(`mutation($a: ID!) { removeSignatureExample(artistId: $a, exampleId: "legacy-guay") { id } }`, { a: artistId }, users.alice);
        expect(await list()).toEqual([]);
        expect((await Artist.findById(artistId))!.haveSignature).toBe('false');
    });

    it('rejects blank labels and too many examples', async () => {
        await expect(add('   ')).rejects.toThrow(/label/);
        for (let i = 0; i < 7; i++) await add(`Type ${i}`);
        await expect(add('One too many')).rejects.toThrow(/up to 8/);
    });
});
