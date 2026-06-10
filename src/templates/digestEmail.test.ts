import { generateDigestEmail } from './digestEmail';

const baseUpdate = {
  changeType: 'update',
  fieldsChanged: ['instagram', 'location'],
};

const baseEvent = {
  changeType: 'added_to_event',
  eventName: 'GP Las Vegas',
  eventStartDate: '2024-06-14',
  eventEndDate: '2024-06-16',
  eventLocation: 'Las Vegas, NV',
};

const baseNewsArticle = {
  changeType: 'news_article',
  newsArticleTitle: 'Artist Announces New Print',
  newsArticleSummary: 'A summary of the article.',
};

afterEach(() => {
  delete process.env.FRONTEND_URL;
});

describe('generateDigestEmail', () => {
  it('returns a valid HTML document', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [] }]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes the artist name', () => {
    const html = generateDigestEmail([{ artistName: 'Zack Stella', changes: [] }]);
    expect(html).toContain('Zack Stella');
  });

  it('includes a link to the artist profile', () => {
    const html = generateDigestEmail([{ artistName: 'Zack Stella', changes: [] }]);
    expect(html).toContain(encodeURIComponent('Zack Stella'));
  });

  it('renders the profile update section when update changes are present', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseUpdate] }]);
    expect(html).toContain('Profile Updated');
    expect(html).toContain('Instagram');
    expect(html).toContain('Location');
  });

  it('uses friendly field labels from the fieldNameMap', () => {
    const html = generateDigestEmail([{
      artistName: 'Alice',
      changes: [{ changeType: 'update', fieldsChanged: ['markssignatureservice'] }],
    }]);
    expect(html).toContain("Mark's Signature Service");
  });

  it('falls back to the raw field name when it is not in the map', () => {
    const html = generateDigestEmail([{
      artistName: 'Alice',
      changes: [{ changeType: 'update', fieldsChanged: ['unknownField'] }],
    }]);
    expect(html).toContain('unknownField');
  });

  it('renders the event section when added_to_event changes are present', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseEvent] }]);
    expect(html).toContain('Added to Event');
    expect(html).toContain('GP Las Vegas');
    expect(html).toContain('Las Vegas, NV');
  });

  it('shows no date range separator when start and end are the same day', () => {
    const singleDay = { ...baseEvent, eventStartDate: '2024-06-14', eventEndDate: '2024-06-14' };
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [singleDay] }]);
    expect(html).not.toContain(' - ');
  });

  it('renders the news article section when news_article changes are present', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseNewsArticle] }]);
    expect(html).toContain('New News Article');
    expect(html).toContain('Artist Announces New Print');
    expect(html).toContain('A summary of the article.');
  });

  it('pluralises the news article heading when there are multiple articles', () => {
    const html = generateDigestEmail([{
      artistName: 'Alice',
      changes: [baseNewsArticle, { ...baseNewsArticle, newsArticleTitle: 'Second Article' }],
    }]);
    expect(html).toContain('New News Articles');
  });

  it('omits the news section when there are no news_article changes', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseUpdate] }]);
    expect(html).not.toContain('New News Article');
  });

  it('omits the updates section when there are no update changes', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseEvent] }]);
    expect(html).not.toContain('Profile Updated');
  });

  it('omits the events section when there are no added_to_event changes', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [baseUpdate] }]);
    expect(html).not.toContain('Added to Event');
  });

  it('renders multiple artists in a single email', () => {
    const html = generateDigestEmail([
      { artistName: 'Alice', changes: [baseUpdate] },
      { artistName: 'Bob', changes: [baseEvent] },
    ]);
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
  });

  it('uses FRONTEND_URL env variable for links when set', () => {
    process.env.FRONTEND_URL = 'https://staging.example.com';
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [] }]);
    expect(html).toContain('https://staging.example.com');
  });

  it('falls back to the production URL when FRONTEND_URL is not set', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [] }]);
    expect(html).toContain('mtgartistconnection.com');
  });

  it('includes a link to manage email preferences', () => {
    const html = generateDigestEmail([{ artistName: 'Alice', changes: [] }]);
    expect(html).toContain('Manage email preferences');
  });
});
