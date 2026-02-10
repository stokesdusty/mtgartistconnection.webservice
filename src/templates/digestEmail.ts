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
  const artistSections = artistChanges.map(({ artistName, changes }) => {
    // Group by change type
    const updates = changes.filter(c => c.changeType === 'update');
    const events = changes.filter(c => c.changeType === 'added_to_event');

    let section = `
      <div style="margin-bottom: 30px; border-bottom: 2px solid #507A60; padding-bottom: 20px;">
        <h2 style="color: #507A60; margin-bottom: 15px;">🎨 ${artistName}</h2>
    `;

    if (updates.length > 0) {
      // Get unique fields across all updates
      const allFields = [...new Set(updates.flatMap(u => u.fieldsChanged))];
      section += `
        <h3 style="color: #333; font-size: 16px; margin-top: 15px;">✏️ Profile Updates</h3>
        <ul style="margin: 10px 0; padding-left: 20px;">
      `;
      allFields.forEach(field => {
        section += `<li>Updated ${fieldNameMap[field] || field}</li>`;
      });
      section += `</ul>`;
    }

    if (events.length > 0) {
      section += `
        <h3 style="color: #333; font-size: 16px; margin-top: 15px;">📅 Upcoming Signing Events</h3>
        <ul style="margin: 10px 0; padding-left: 20px;">
      `;
      events.forEach(event => {
        const startDate = new Date(event.eventStartDate).toLocaleDateString();
        const endDate = new Date(event.eventEndDate).toLocaleDateString();
        section += `
          <li style="margin-bottom: 10px;">
            <strong>${event.eventName}</strong><br/>
            ${startDate}${startDate !== endDate ? ` - ${endDate}` : ''}<br/>
            Location: ${event.eventLocation}
          </li>
        `;
      });
      section += `</ul>`;
    }

    section += `
        <p style="margin-top: 15px;">
          <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/artist/${encodeURIComponent(artistName)}"
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
            <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/settings"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Manage email preferences
            </a> |
            <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}/settings"
               style="color: #507A60; text-decoration: none; font-weight: 600;">
              Unfollow artists
            </a>
          </p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            You're receiving this email because you follow these artists and have artist update emails enabled.
          </p>
          <p style="margin-top: 10px;">
            <a href="${process.env.FRONTEND_URL || 'https://mtgartistconnection.com'}"
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
