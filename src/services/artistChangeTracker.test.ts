import { getNotifiableChangedFields } from './artistChangeTracker';

describe('getNotifiableChangedFields', () => {
  it('detects a changed value', () => {
    expect(getNotifiableChangedFields({ location: 'Seattle' }, { location: 'Portland' })).toEqual(['location']);
  });

  it('detects a newly added value', () => {
    expect(getNotifiableChangedFields({}, { patreon: 'https://patreon.com/x' })).toEqual(['patreon']);
  });

  it('ignores unchanged values', () => {
    expect(getNotifiableChangedFields({ instagram: 'abc' }, { instagram: 'abc' })).toEqual([]);
  });

  it('treats missing, null and blank as equal', () => {
    expect(getNotifiableChangedFields({ youtube: undefined, twitter: null }, { youtube: '', twitter: '  ' })).toEqual([]);
  });

  it('ignores whitespace-only differences', () => {
    expect(getNotifiableChangedFields({ url: 'https://a.com' }, { url: ' https://a.com ' })).toEqual([]);
  });

  it('skips undefined and null incoming values', () => {
    expect(getNotifiableChangedFields({ email: 'a@b.com' }, { email: undefined, bluesky: null })).toEqual([]);
  });

  it('skips internal fields', () => {
    expect(getNotifiableChangedFields({}, { filename: 'x.png', scryfall_name: 'X', alternate_names: 'Y' })).toEqual([]);
  });

  it('detects a cleared value', () => {
    expect(getNotifiableChangedFields({ signing: 'yes' }, { signing: '' })).toEqual(['signing']);
  });
});
