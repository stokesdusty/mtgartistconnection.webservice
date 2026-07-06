import { escapeRegex } from './regex';

describe('escapeRegex', () => {
  it('leaves plain alphanumeric strings unchanged', () => {
    expect(escapeRegex('Some Artist')).toBe('Some Artist');
  });

  it('escapes regex metacharacters so they match literally', () => {
    const input = 'Some (Artist)+';
    const escaped = escapeRegex(input);
    const regex = new RegExp(`^${escaped}$`, 'i');

    expect(regex.test(input)).toBe(true);
    // Unescaped, "(Artist)+" would be a group repeated one-or-more times,
    // matching this string too; confirm it's treated as a literal instead.
    expect(regex.test('Some ArtistArtist')).toBe(false);
    expect(regex.test('Some Artist')).toBe(false);
  });

  it('escapes every special character in the class', () => {
    const input = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(input);
    const regex = new RegExp(`^${escaped}$`, 'i');

    expect(regex.test(input)).toBe(true);
  });
});
