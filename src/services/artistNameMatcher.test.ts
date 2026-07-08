import { findArtistMatches, splitAlternateNames, normalize } from './artistNameMatcher';

describe('splitAlternateNames', () => {
  it('returns an empty array for null/undefined/empty input', () => {
    expect(splitAlternateNames(undefined)).toEqual([]);
    expect(splitAlternateNames(null)).toEqual([]);
    expect(splitAlternateNames('')).toEqual([]);
    expect(splitAlternateNames('   ')).toEqual([]);
  });

  it('splits comma, semicolon, and slash separated values', () => {
    expect(splitAlternateNames('Foo, Bar; Baz/Qux')).toEqual(
      expect.arrayContaining(['Foo', 'Bar', 'Baz', 'Qux'])
    );
  });

  it('splits on "aka"', () => {
    expect(splitAlternateNames('Real Name aka Pen Name')).toEqual(
      expect.arrayContaining(['Real Name', 'Pen Name'])
    );
  });

  it('always includes the whole raw string as a fallback candidate', () => {
    const result = splitAlternateNames('One Undelimited Freeform Alias');
    expect(result).toContain('One Undelimited Freeform Alias');
  });
});

describe('normalize', () => {
  it('lowercases text', () => {
    expect(normalize('HELLO')).toBe('hello');
  });

  it('strips accents while preserving string length', () => {
    const input = 'José García';
    const normalized = normalize(input);
    expect(normalized).toBe('jose garcia');
    expect(normalized.length).toBe(input.length);
  });
});

describe('findArtistMatches', () => {
  it('finds an exact name match with a snippet', () => {
    const pageText = 'Guests this year include Jane Doe and other special guests.';
    const matches = findArtistMatches(pageText, [{ name: 'Jane Doe' }]);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Jane Doe');
    expect(matches[0].matchedAlias).toBe('Jane Doe');
    expect(matches[0].occurrences).toBe(1);
    expect(matches[0].snippets[0]).toContain('Jane Doe');
  });

  it('matches via comma-separated alternate names', () => {
    const pageText = 'Signing at booth 12: J. Smith, comics artist.';
    const matches = findArtistMatches(pageText, [
      { name: 'John Smith', alternate_names: 'J. Smith, Johnny Smith' },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedAlias).toBe('J. Smith');
  });

  it('matches via an undelimited freeform alternate_names phrase', () => {
    const pageText = 'Meet The Sketch Wizard at table 4.';
    const matches = findArtistMatches(pageText, [
      { name: 'Alex Rivera', alternate_names: 'The Sketch Wizard' },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedAlias).toBe('The Sketch Wizard');
  });

  it('is case- and accent-insensitive', () => {
    const pageText = 'Come meet JOSE GARCIA this weekend!';
    const matches = findArtistMatches(pageText, [{ name: 'José García' }]);
    expect(matches).toHaveLength(1);
    expect(matches[0].occurrences).toBe(1);
  });

  it('does not false-positive short names as substrings of unrelated words', () => {
    const pageText = 'The Grayson family will be attending as guests.';
    const matches = findArtistMatches(pageText, [{ name: 'Ray' }]);
    expect(matches).toHaveLength(0);
  });

  it('matches names containing regex-special characters literally', () => {
    const pageText = 'Special guest: Foo (Bar)+ will be present.';
    const matches = findArtistMatches(pageText, [{ name: 'Foo (Bar)+' }]);
    expect(matches).toHaveLength(1);
    expect(matches[0].occurrences).toBe(1);
  });

  it('matches names containing an apostrophe', () => {
    const pageText = "Featured artist: D'Angelo will be signing all day.";
    const matches = findArtistMatches(pageText, [{ name: "D'Angelo" }]);
    expect(matches).toHaveLength(1);
    expect(matches[0].occurrences).toBe(1);
  });

  it('counts multiple occurrences and caps snippets', () => {
    const pageText = Array(8).fill('Jane Doe will be here.').join(' ');
    const matches = findArtistMatches(pageText, [{ name: 'Jane Doe' }]);
    expect(matches).toHaveLength(1);
    expect(matches[0].occurrences).toBe(8);
    expect(matches[0].snippets.length).toBeLessThanOrEqual(5);
  });

  it('returns no matches when nothing in the corpus appears on the page', () => {
    const pageText = 'Nothing relevant here at all.';
    const matches = findArtistMatches(pageText, [{ name: 'Someone Else' }]);
    expect(matches).toHaveLength(0);
  });

  it('tolerates whitespace differences between the DB name and page text', () => {
    const pageText = 'Guest:   Todd    McFarlane   will attend.';
    const matches = findArtistMatches(pageText, [{ name: 'Todd McFarlane' }]);
    expect(matches).toHaveLength(1);
  });
});
