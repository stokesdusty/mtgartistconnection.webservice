import { SITE_URL } from './siteUrl';
import { chip, monoLabel, palette, renderEmail, subscriberFooter, textLink } from './emailLayout';

interface ArtistChangeData {
  artistName: string;
  changes: any[]; // ArtistChange documents
}

const fieldNameMap: Record<string, string> = {
  name: 'Artist Name',
  email: 'Email',
  instagram: 'Instagram',
  facebook: 'Facebook',
  twitter: 'Twitter',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  artstation: 'ArtStation',
  patreon: 'Patreon',
  location: 'Location',
  url: 'Website',
  signing: 'Signing Status',
  signingComment: 'Signing Comment',
  haveSignature: 'Signature Example',
  artistProofs: 'Artist Proofs',
  filename: 'Image Filename',
  mountainmage: 'MountainMage Service',
  markssignatureservice: "Mark's Signature Service",
  omalink: 'OMA Link',
  inprnt: 'INPRNT Link',
  artistNote: 'Note from the Artist',
};

// One labelled block inside an artist card ("Profile Updated", "Added to Events", ...).
const changeBlock = (label: string, color: string, content: string): string => `
  <div style="margin-top: 16px; padding-left: 12px; border-left: 2px solid ${color};">
    <div style="margin-bottom: 8px;">${monoLabel(label, color)}</div>
    ${content}
  </div>
`;

export const generateDigestEmail = (artistChanges: ArtistChangeData[]): string => {
  const artistSections = artistChanges.map(({ artistName, changes }) => {
    // Group by change type
    const updates = changes.filter(c => c.changeType === 'update');
    const events = changes.filter(c => c.changeType === 'added_to_event');
    const newsArticles = changes.filter(c => c.changeType === 'news_article');
    const profileUrl = `${SITE_URL}/artist/${encodeURIComponent(artistName)}`;

    let blocks = '';

    if (events.length > 0) {
      blocks += changeBlock(
        `Added to Event${events.length > 1 ? 's' : ''}`,
        palette.accentText,
        events.map(event => {
          const startDate = new Date(event.eventStartDate).toLocaleDateString();
          const endDate = new Date(event.eventEndDate).toLocaleDateString();
          return `
            <p style="margin: 0 0 8px;">
              <strong style="font-size: 15px; color: ${palette.fg};">${event.eventName}</strong><br/>
              <span style="font-size: 13px; color: ${palette.muted};">
                ${startDate}${startDate !== endDate ? ` - ${endDate}` : ''} &middot; ${event.eventLocation}
              </span>
            </p>
          `;
        }).join(''),
      );
    }

    // News pages are hidden on the site, so these link through the artist profile below.
    if (newsArticles.length > 0) {
      blocks += changeBlock(
        `New News Article${newsArticles.length > 1 ? 's' : ''}`,
        palette.info,
        newsArticles.map(article => `
          <p style="margin: 0 0 8px;">
            <strong style="font-size: 15px; color: ${palette.fg};">${article.newsArticleTitle || 'New Article'}</strong><br/>
            <span style="font-size: 13px; line-height: 1.5; color: ${palette.muted};">${article.newsArticleSummary || ''}</span>
          </p>
        `).join(''),
      );
    }

    if (updates.length > 0) {
      // Get unique fields across all updates
      const allFields = [...new Set(updates.flatMap(u => u.fieldsChanged))] as string[];
      blocks += changeBlock(
        'Profile Updated',
        palette.warn,
        `<div>${allFields.map(field => chip(fieldNameMap[field] || field)).join('')}</div>`,
      );
    }

    return `
      <div style="margin-top: 20px; padding: 20px; background-color: ${palette.surface}; border: 1px solid ${palette.line}; border-radius: 12px;">
        <h2 style="margin: 0; font-size: 20px; line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; color: ${palette.fg};">${artistName}</h2>
        ${blocks}
        <p style="margin: 18px 0 0; font-size: 14px;">
          ${textLink(profileUrl, `View ${artistName}'s Profile &rarr;`)}
        </p>
      </div>
    `;
  }).join('');

  const artistCount = artistChanges.length;
  const artistLabel = `${artistCount} artist${artistCount === 1 ? '' : 's'}`;

  return renderEmail({
    title: 'Your daily artist updates',
    preheader: `New activity from ${artistLabel} you follow.`,
    eyebrow: `Daily digest &middot; ${artistLabel}`,
    heading: 'Artist',
    headingMuted: 'updates.',
    intro: `Here's what changed today for artists you follow.`,
    body: artistSections,
    footer: subscriberFooter(
      `You're receiving this email because you follow these artists and have artist update emails enabled.`,
      [[`${SITE_URL}/settings`, 'Manage email preferences'], [`${SITE_URL}/following`, 'Unfollow artists']],
    ),
  });
};
