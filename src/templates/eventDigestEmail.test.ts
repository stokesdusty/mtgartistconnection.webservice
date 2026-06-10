import { generateEventDigestEmail, EventData } from './eventDigestEmail';

const baseEvent: EventData = {
  eventName: 'GP Las Vegas',
  city: 'Las Vegas',
  state: 'NV',
  startDate: new Date('2024-06-14'),
  endDate: new Date('2024-06-16'),
  url: 'https://example.com/event',
};

afterEach(() => {
  delete process.env.FRONTEND_URL;
});

describe('generateEventDigestEmail', () => {
  it('returns a valid HTML document', () => {
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the event name', () => {
    expect(generateEventDigestEmail([baseEvent])).toContain('GP Las Vegas');
  });

  it('includes the city and state', () => {
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain('Las Vegas');
    expect(html).toContain('NV');
  });

  it('includes a link to the event URL when provided', () => {
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain('https://example.com/event');
    expect(html).toContain('View Event Details');
  });

  it('omits the event URL link when url is not provided', () => {
    const { url, ...noUrl } = baseEvent;
    const html = generateEventDigestEmail([noUrl]);
    expect(html).not.toContain('View Event Details');
  });

  it('uses plural "Dates:" label when start and end differ', () => {
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain('<strong>Dates:</strong>');
  });

  it('uses singular "Date:" label and no range separator when start and end are the same', () => {
    // Template uses === (reference equality) to detect single-day events
    const sameDate = new Date('2024-06-14');
    const singleDay = { ...baseEvent, startDate: sameDate, endDate: sameDate };
    const html = generateEventDigestEmail([singleDay]);
    expect(html).toContain('<strong>Date:</strong>');
    expect(html).not.toContain(' - ');
  });

  it('renders the artists attending list when artists are provided', () => {
    const withArtists = { ...baseEvent, artists: ['Alice', 'Bob'] };
    const html = generateEventDigestEmail([withArtists]);
    expect(html).toContain('Artists Attending');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('omits the artists attending section when artists array is empty', () => {
    const noArtists = { ...baseEvent, artists: [] };
    const html = generateEventDigestEmail([noArtists]);
    expect(html).not.toContain('Artists Attending');
  });

  it('highlights newly added artists with a sparkle marker', () => {
    const withNew = {
      ...baseEvent,
      changeType: 'artist_added' as const,
      artists: ['Alice', 'Bob'],
      artistsAdded: ['Bob'],
    };
    const html = generateEventDigestEmail([withNew]);
    expect(html).toContain('Bob');
    expect(html).toContain('✨');
  });

  it('shows NEW ARTIST ADDED badge for single new artist', () => {
    const withNew = {
      ...baseEvent,
      changeType: 'artist_added' as const,
      artistsAdded: ['Bob'],
    };
    const html = generateEventDigestEmail([withNew]);
    expect(html).toContain('NEW ARTIST ADDED');
  });

  it('shows count badge for multiple new artists', () => {
    const withNew = {
      ...baseEvent,
      changeType: 'artist_added' as const,
      artistsAdded: ['Alice', 'Bob'],
    };
    const html = generateEventDigestEmail([withNew]);
    expect(html).toContain('2 NEW ARTISTS ADDED');
  });

  it('handles backwards-compatible artistAdded single field', () => {
    const withLegacy = {
      ...baseEvent,
      changeType: 'artist_added' as const,
      artistAdded: 'Alice',
    };
    const html = generateEventDigestEmail([withLegacy]);
    expect(html).toContain('NEW ARTIST ADDED');
  });

  it('renders multiple events in a single email', () => {
    const second: EventData = { ...baseEvent, eventName: 'SCG Baltimore' };
    const html = generateEventDigestEmail([baseEvent, second]);
    expect(html).toContain('GP Las Vegas');
    expect(html).toContain('SCG Baltimore');
  });

  it('includes a footer with the current year', () => {
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain(String(new Date().getFullYear()));
  });

  it('links to FRONTEND_URL for managing monitored locations', () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';
    const html = generateEventDigestEmail([baseEvent]);
    expect(html).toContain('https://staging.example.com');
  });
});
