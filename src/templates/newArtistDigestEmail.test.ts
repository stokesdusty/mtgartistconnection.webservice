import { generateNewArtistDigestEmail } from './newArtistDigestEmail';

afterEach(() => {
  delete process.env.FRONTEND_URL;
});

describe('generateNewArtistDigestEmail', () => {
  it('returns a valid HTML document', () => {
    const html = generateNewArtistDigestEmail(['Alice']);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes every artist name', () => {
    const html = generateNewArtistDigestEmail(['Alice', 'Bob', 'Carol']);
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Carol');
  });

  it('uses singular "artist has" for a single artist', () => {
    expect(generateNewArtistDigestEmail(['Alice'])).toContain('1 new artist has');
  });

  it('uses plural "artists have" for multiple artists', () => {
    expect(generateNewArtistDigestEmail(['Alice', 'Bob'])).toContain('2 new artists have');
  });

  it('generates a profile link for each artist', () => {
    const html = generateNewArtistDigestEmail(['Zack Stella']);
    expect(html).toContain(encodeURIComponent('Zack Stella'));
  });

  it('includes a Browse All Artists link', () => {
    expect(generateNewArtistDigestEmail(['Alice'])).toContain('Browse All Artists');
  });

  it('includes a Manage email preferences link', () => {
    expect(generateNewArtistDigestEmail(['Alice'])).toContain('Manage email preferences');
  });

  it('uses FRONTEND_URL env variable for links when set', () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';
    const html = generateNewArtistDigestEmail(['Alice']);
    expect(html).toContain('https://staging.example.com');
  });

  it('falls back to the production URL when FRONTEND_URL is not set', () => {
    expect(generateNewArtistDigestEmail(['Alice'])).toContain('mtgartistconnection.com');
  });

  it('handles an empty artist list without throwing', () => {
    expect(() => generateNewArtistDigestEmail([])).not.toThrow();
  });

  it('shows a count of 0 for an empty list', () => {
    expect(generateNewArtistDigestEmail([])).toContain('0 new artists have');
  });
});
