import { collectArtists, matchSetArtists, shouldRefreshSet, splitArtistCredit } from './setArtists';

describe('splitArtistCredit', () => {
  it('splits shared credits', () => {
    expect(splitArtistCredit('Jesper Ejsing & Kev Walker')).toEqual(['Jesper Ejsing', 'Kev Walker']);
  });

  it('keeps single credits as-is', () => {
    expect(splitArtistCredit(' Rebecca Guay ')).toEqual(['Rebecca Guay']);
  });
});

describe('collectArtists', () => {
  it('collects unique artists, including double-faced card faces', () => {
    const cards = [
      { artist: 'Seb McKinnon' },
      { artist: 'Seb McKinnon' },
      { artist: 'Chris Rahn & Rovina Cai' },
      { card_faces: [{ artist: 'Magali Villeneuve' }, { artist: 'Nils Hamm' }] },
      {},
    ];
    expect(collectArtists(cards).sort()).toEqual(
      ['Chris Rahn', 'Magali Villeneuve', 'Nils Hamm', 'Rovina Cai', 'Seb McKinnon'],
    );
  });
});

describe('shouldRefreshSet', () => {
  const now = new Date('2026-10-07T00:00:00Z');

  it('refreshes sets we have never stored', () => {
    expect(shouldRefreshSet('2001-01-01', false, now)).toBe(true);
  });

  it('refreshes recent and upcoming sets', () => {
    expect(shouldRefreshSet('2026-08-14', true, now)).toBe(true);
    expect(shouldRefreshSet('2027-02-01', true, now)).toBe(true);
  });

  it('leaves older stored sets alone', () => {
    expect(shouldRefreshSet('2025-01-01', true, now)).toBe(false);
  });

  it('refreshes when the release date is missing or invalid', () => {
    expect(shouldRefreshSet(undefined, true, now)).toBe(true);
    expect(shouldRefreshSet('not a date', true, now)).toBe(true);
  });
});

describe('matchSetArtists', () => {
  const dbArtists = [
    { name: 'Seb McKinnon', scryfall_name: 'Sebastian McKinnon' },
    { name: 'Rebecca Guay', scryfall_name: null },
    { name: 'Kev Walker' },
  ];

  it('matches on scryfall_name when the display name differs', () => {
    expect(matchSetArtists(['Sebastian McKinnon'], dbArtists)).toEqual(['Seb McKinnon']);
  });

  it('falls back to the display name, ignoring case and spaces', () => {
    expect(matchSetArtists(['rebecca  guay', 'KEV WALKER'], dbArtists)).toEqual(['Kev Walker', 'Rebecca Guay']);
  });

  it('drops Scryfall artists we do not have and de-duplicates', () => {
    expect(matchSetArtists(['Unknown Person', 'Kev Walker', 'Kev Walker'], dbArtists)).toEqual(['Kev Walker']);
  });

  it('lets an explicit scryfall_name win over another artist\'s display name', () => {
    const artists = [
      { name: 'Alex Smith' },
      { name: 'Alexander Smith', scryfall_name: 'Alex Smith' },
    ];
    expect(matchSetArtists(['Alex Smith'], artists)).toEqual(['Alexander Smith']);
  });
});
