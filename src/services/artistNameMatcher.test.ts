import { findArtistMatches, splitAlternateNames, normalize, deriveNameFromImageSrc } from './artistNameMatcher';

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

  it('matches an artist via an image alt attribute when not present in page text', () => {
    const pageText = 'Come meet our special guests this weekend!';
    const matches = findArtistMatches(pageText, [{ name: 'Randy Gallegos' }], [
      { src: 'https://example.com/.jpg', alt: 'Randy Gallegos', title: null },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].snippets).toHaveLength(0);
    expect(matches[0].imageMatches).toEqual([
      { imageUrl: 'https://example.com/.jpg', matchedText: 'Randy Gallegos' },
    ]);
  });

  it('matches an artist via a de-slugified image filename with no alt/title', () => {
    const pageText = 'Come meet our special guests this weekend!';
    const matches = findArtistMatches(pageText, [{ name: 'Randy Gallegos' }], [
      { src: 'https://cdn.example.com/2025/08/c6d026ba-randy-gallegos-1024x1024.jpg', alt: null, title: null },
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0].imageMatches[0].imageUrl).toBe(
      'https://cdn.example.com/2025/08/c6d026ba-randy-gallegos-1024x1024.jpg'
    );
  });

  it('does not double-count one image matching via both filename and alt text', () => {
    const matches = findArtistMatches('', [{ name: 'Randy Gallegos' }], [
      { src: 'https://cdn.example.com/randy-gallegos.jpg', alt: 'Randy Gallegos', title: null },
    ]);
    expect(matches[0].occurrences).toBe(1);
    expect(matches[0].imageMatches).toHaveLength(1);
  });

  it('does not match images unrelated to the artist corpus', () => {
    const matches = findArtistMatches('', [{ name: 'Randy Gallegos' }], [
      { src: 'https://cdn.example.com/2022/01/986cd0be-mono-mobile-logo.webp', alt: null, title: null },
    ]);
    expect(matches).toHaveLength(0);
  });
});

describe('deriveNameFromImageSrc', () => {
  it('strips a content-hash prefix, extension, and dimension suffix', () => {
    expect(deriveNameFromImageSrc('https://cdn.example.com/2024/12/af9b226b-jarel-threat-1024x1024.jpg')).toBe(
      'jarel threat'
    );
  });

  it('handles filenames with no hash prefix', () => {
    expect(deriveNameFromImageSrc('https://cdn.example.com/rk-post.jpg')).toBe('rk post');
  });

  it('strips "-scaled" and "@2x" suffixes', () => {
    expect(deriveNameFromImageSrc('https://cdn.example.com/ken-meyer-jr-scaled.png')).toBe('ken meyer jr');
    expect(deriveNameFromImageSrc('https://cdn.example.com/ken-meyer-jr@2x.png')).toBe('ken meyer jr');
  });

  it('decodes URL-encoded characters', () => {
    expect(deriveNameFromImageSrc('https://cdn.example.com/jos%C3%A9-garcia.jpg')).toBe('josé garcia');
  });

  it('returns an empty string when there is no filename to work with', () => {
    expect(deriveNameFromImageSrc('https://cdn.example.com/.jpg')).toBe('');
  });
});
