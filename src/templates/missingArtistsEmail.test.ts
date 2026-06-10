import { generateScryfallSyncEmail } from './missingArtistsEmail';

const missingFromDb = ['Terese Nielsen', 'Rebecca Guay'];
const notOnScryfall = [
  { name: 'Old Artist', scryfall_name: 'old-artist-typo' },
  { name: 'Removed Artist', scryfall_name: 'removed-artist' },
];

describe('generateScryfallSyncEmail', () => {
  it('returns a valid HTML document', () => {
    const html = generateScryfallSyncEmail(missingFromDb, notOnScryfall, 1000, 950);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the Scryfall Sync Report heading', () => {
    const html = generateScryfallSyncEmail(missingFromDb, notOnScryfall, 1000, 950);
    expect(html).toContain('Scryfall Artist Sync Report');
  });

  // ---------------------------------------------------------------------------
  // Summary section
  // ---------------------------------------------------------------------------
  it('shows the scryfall total count in the summary', () => {
    const html = generateScryfallSyncEmail(missingFromDb, notOnScryfall, 1234, 950);
    expect(html).toContain('1,234');
  });

  it('shows the database total count in the summary', () => {
    const html = generateScryfallSyncEmail(missingFromDb, notOnScryfall, 1000, 987);
    expect(html).toContain('987');
  });

  it('shows the missing-from-db count in the summary', () => {
    const html = generateScryfallSyncEmail(['A', 'B', 'C'], [], 100, 90);
    expect(html).toContain('>3<');
  });

  it('shows the not-on-scryfall count in the summary', () => {
    const html = generateScryfallSyncEmail([], notOnScryfall, 100, 90);
    expect(html).toContain('>2<');
  });

  // ---------------------------------------------------------------------------
  // "Missing from DB" section
  // ---------------------------------------------------------------------------
  it('renders the missing-from-db section when the list is non-empty', () => {
    const html = generateScryfallSyncEmail(missingFromDb, [], 100, 90);
    expect(html).toContain('Scryfall Artists Not in Your Database');
    expect(html).toContain('Terese Nielsen');
    expect(html).toContain('Rebecca Guay');
  });

  it('omits the missing-from-db section when the list is empty', () => {
    const html = generateScryfallSyncEmail([], notOnScryfall, 100, 90);
    expect(html).not.toContain('Scryfall Artists Not in Your Database');
  });

  it('shows the correct count in the missing-from-db description', () => {
    const html = generateScryfallSyncEmail(['A', 'B'], [], 100, 90);
    expect(html).toContain('2 artist names from Scryfall');
  });

  // ---------------------------------------------------------------------------
  // "Not on Scryfall" section
  // ---------------------------------------------------------------------------
  it('renders the not-on-scryfall section when the list is non-empty', () => {
    const html = generateScryfallSyncEmail([], notOnScryfall, 100, 90);
    expect(html).toContain('Your Artists Not Found on Scryfall');
    expect(html).toContain('Old Artist');
    expect(html).toContain('old-artist-typo');
  });

  it('omits the not-on-scryfall section when the list is empty', () => {
    const html = generateScryfallSyncEmail(missingFromDb, [], 100, 90);
    expect(html).not.toContain('Your Artists Not Found on Scryfall');
  });

  it('shows both artist name and scryfall_name in the not-on-scryfall list', () => {
    const html = generateScryfallSyncEmail([], [{ name: 'My Artist', scryfall_name: 'my-artist-key' }], 100, 90);
    expect(html).toContain('My Artist');
    expect(html).toContain('my-artist-key');
  });

  it('shows the correct count in the not-on-scryfall description', () => {
    const html = generateScryfallSyncEmail([], notOnScryfall, 100, 90);
    expect(html).toContain('2 artists in your database');
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  it('renders cleanly when both lists are empty', () => {
    const html = generateScryfallSyncEmail([], [], 500, 480);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('Scryfall Artists Not in Your Database');
    expect(html).not.toContain('Your Artists Not Found on Scryfall');
  });

  it('includes the automated admin report footer', () => {
    const html = generateScryfallSyncEmail([], [], 0, 0);
    expect(html).toContain('automated admin report');
  });
});
