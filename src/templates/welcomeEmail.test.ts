import { generateWelcomeEmail } from './welcomeEmail';

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

  it('links to the www production site', () => {
    expect(generateWelcomeEmail()).toContain('https://www.mtgartistconnection.com');
  });

  it('mentions following artists', () => {
    expect(generateWelcomeEmail()).toContain('Follow Artists');
  });

  it('mentions monitoring states', () => {
    expect(generateWelcomeEmail()).toContain('Monitor States');
  });
});
