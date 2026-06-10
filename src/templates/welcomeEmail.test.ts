import { generateWelcomeEmail } from './welcomeEmail';

afterEach(() => {
  delete process.env.FRONTEND_URL;
});

describe('generateWelcomeEmail', () => {
  it('returns a string', () => {
    expect(typeof generateWelcomeEmail()).toBe('string');
  });

  it('produces a valid HTML document', () => {
    const html = generateWelcomeEmail();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });

  it('contains the welcome heading', () => {
    expect(generateWelcomeEmail()).toContain('Welcome to MTG Artist Connection');
  });

  it('contains a Browse Artists call-to-action link', () => {
    expect(generateWelcomeEmail()).toContain('Browse Artists');
  });

  it('uses FRONTEND_URL env variable when set', () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';
    expect(generateWelcomeEmail()).toContain('https://staging.example.com');
  });

  it('falls back to the production URL when FRONTEND_URL is not set', () => {
    expect(generateWelcomeEmail()).toContain('mtgartistconnection.com');
  });

  it('mentions following artists', () => {
    expect(generateWelcomeEmail()).toContain('Follow Artists');
  });

  it('mentions monitoring states', () => {
    expect(generateWelcomeEmail()).toContain('Monitor States');
  });
});
