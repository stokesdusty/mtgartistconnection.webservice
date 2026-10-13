import { publicSiteUrl } from './siteUrl';

describe('publicSiteUrl', () => {
    const OLD = process.env.FRONTEND_URL;
    afterEach(() => { process.env.FRONTEND_URL = OLD; });

    it.each([
        ['https://mtgartistconnection.com', 'https://www.mtgartistconnection.com'],
        ['http://mtgartistconnection.com/', 'https://www.mtgartistconnection.com'],
        ['https://MTGArtistConnection.com', 'https://www.mtgartistconnection.com'],
        ['https://www.mtgartistconnection.com/', 'https://www.mtgartistconnection.com'],
        [' http://localhost:3001/ ', 'http://localhost:3001'],
    ])('turns %p into %p', (configured, expected) => {
        process.env.FRONTEND_URL = configured;
        expect(publicSiteUrl()).toBe(expected);
    });

    it('falls back to the www site', () => {
        delete process.env.FRONTEND_URL;
        expect(publicSiteUrl()).toBe('https://www.mtgartistconnection.com');
    });

    it("leaves other domains that merely contain the name alone", () => {
        process.env.FRONTEND_URL = 'https://mtgartistconnection.com.example.org';
        expect(publicSiteUrl()).toBe('https://mtgartistconnection.com.example.org');
    });
});
