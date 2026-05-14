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
};

export const generateDigestEmail = (artistChanges: ArtistChangeData[]): string => {
  const baseUrl = process.env.FRONTEND_URL || 'https://www.mtgartistconnection.com';

  const artistSections = artistChanges.map(({ artistName, changes }) => {
    // Group by change type
    const updates = changes.filter(c => c.changeType === 'update');
    const events = changes.filter(c => c.changeType === 'added_to_event');
    const newsArticles = changes.filter(c => c.changeType === 'news_article');

    let section = `
      <div style="margin-bottom: 30px; border-bottom: 2px solid #507A60; padding-bottom: 20px;">
        <h2 style="color: #507A60; margin-bottom: 15px;">🎨 ${artistName}</h2>
    `;

    // News Articles Section
    if (newsArticles.length > 0) {
      section += `
        <div style="background-color: #f0f7f2; border-left: 4px solid #507A60; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0;">
          <h3 style="color: #333; font-size: 16px; margin: 0 0 10px 0;">📰 New News Article${newsArticles.length > 1 ? 's' : ''}</h3>
      `;
      newsArticles.forEach(article => {
        section += `
          <div style="margin-bottom: 12px;">
            <strong style="color: #507A60;">${article.newsArticleTitle || 'New Article'}</strong>
            <p style="margin: 5px 0; color: #555; font-size: 14px;">${article.newsArticleSummary || ''}</p>
          </div>
        `;
      });
      section += `
          <a href="${baseUrl}/news/artist/${encodeURIComponent(artistName)}"
             style="color: #507A60; text-decoration: none; font-weight: 600; font-size: 14px;">
            Read full article${newsArticles.length > 1 ? 's' : ''} →
          </a>
        </div>
      `;
    }

    // Profile Updates Section
    if (updates.length > 0) {
      // Get unique fields across all updates
      const allFields = [...new Set(updates.flatMap(u => u.fieldsChanged))];
      section += `
        <div style="background-color: #fff8e6; border-left: 4px solid #f0ad4e; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0;">
          <h3 style="color: #333; font-size: 16px; margin: 0 0 10px 0;">✏️ Profile Updated</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
      `;
      allFields.forEach(field => {
        section += `<li style="margin-bottom: 4px;">${fieldNameMap[field] || field}</li>`;
      });
      section += `
          </ul>
        </div>
      `;
    }

    // Events Section
    if (events.length > 0) {
      section += `
        <div style="background-color: #e6f3ff; border-left: 4px solid #5bc0de; padding: 12px 15px; margin: 15px 0; border-radius: 0 8px 8px 0;">
          <h3 style="color: #333; font-size: 16px; margin: 0 0 10px 0;">📅 Added to Event${events.length > 1 ? 's' : ''}</h3>
      `;
      events.forEach(event => {
        const startDate = new Date(event.eventStartDate).toLocaleDateString();
        const endDate = new Date(event.eventEndDate).toLocaleDateString();
        section += `
          <div style="margin-bottom: 10px;">
            <strong style="color: #31708f;">${event.eventName}</strong><br/>
            <span style="color: #555; font-size: 14px;">
              ${startDate}${startDate !== endDate ? ` - ${endDate}` : ''} • ${event.eventLocation}
            </span>
          </div>
        `;
      });
      section += `</div>`;
    }

    section += `
        <p style="margin-top: 15px;">
          <a href="${baseUrl}/artist/${encodeURIComponent(artistName)}"
             style="color: #507A60; text-decoration: none; font-weight: 600;">
            View ${artistName}'s Profile →
          </a>
        </p>
      </div>
    `;
    return section;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #507A60; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">MTG Artist Connection</h1>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Your Daily Artist Updates</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <p style="font-size: 16px; margin-top: 0; color: #555;">
          Here are today's updates for artists you follow:
        </p>

        ${artistSections}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 14px; color: #666;">
          <p>
            <a href="${baseUrl}/settings"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Manage email preferences
            </a> |
            <a href="${baseUrl}/settings"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Unfollow artists
            </a>
          </p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            You're receiving this email because you follow these artists and have artist update emails enabled.
          </p>
          <p style="margin-top: 10px;">
            <a href="${baseUrl}"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Visit MTG Artist Connection
            </a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
