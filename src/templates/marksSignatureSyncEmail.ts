interface InPostNotFlagged {
  name: string;
  matchedAs: string;
}

interface FlaggedNotInPost {
  name: string;
}

const listBox = (items: string, marginBottom = true): string => `
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 6px; padding: 10px;${marginBottom ? ' margin-bottom: 25px;' : ''}">
      <ul style="margin: 0; padding-left: 20px; font-size: 14px;">
        ${items}
      </ul>
    </div>
`;

export const generateMarksSignatureSyncEmail = (
  inPostNotFlagged: InPostNotFlagged[],
  flaggedNotInPost: FlaggedNotInPost[],
  unmatchedPostNames: string[],
  matchedInPostTotal: number,
  flaggedTotal: number,
  postUrl: string
): string => {
  const inPostNotFlaggedList = inPostNotFlagged
    .map(artist => `<li style="margin-bottom: 5px;"><strong>${artist.name}</strong>${artist.matchedAs !== artist.name ? ` (listed as "${artist.matchedAs}")` : ''}</li>`)
    .join('');

  const flaggedNotInPostList = flaggedNotInPost
    .map(artist => `<li style="margin-bottom: 5px;"><strong>${artist.name}</strong></li>`)
    .join('');

  const unmatchedPostNamesList = unmatchedPostNames
    .map(name => `<li style="margin-bottom: 5px;"><strong>${name}</strong></li>`)
    .join('');

  const inPostNotFlaggedSection = inPostNotFlagged.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Listed by Mark but Not Flagged</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${inPostNotFlagged.length.toLocaleString()} artists appear in Mark's post but don't have
      <code>markssignatureservice</code> set to <code>true</code> in your database.
    </p>
    ${listBox(inPostNotFlaggedList)}
  ` : '';

  const flaggedNotInPostSection = flaggedNotInPost.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Flagged but Not Listed by Mark</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${flaggedNotInPost.length.toLocaleString()} artists have <code>markssignatureservice</code> set to
      <code>true</code> in your database, but neither their name nor any alternate name appears in Mark's post.
    </p>
    ${listBox(flaggedNotInPostList)}
  ` : '';

  const unmatchedPostNamesSection = unmatchedPostNames.length > 0 ? `
    <h2 style="color: #507A60; margin-bottom: 15px;">Names in Mark's Post Not Found in Your Database</h2>
    <p style="color: #666; font-size: 14px; margin-bottom: 15px;">
      The following ${unmatchedPostNames.length.toLocaleString()} names were parsed from Mark's post but don't match any
      artist name or alternate name in your database. These are often misspellings — consider adding them as
      <code>alternate_names</code>, or to the job's ignore list.
    </p>
    ${listBox(unmatchedPostNamesList, false)}
  ` : '';

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
        <p style="margin: 5px 0 0 0; font-size: 14px;">Mark's Signature Service Sync Report</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; color: #507A60;">Summary</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            <li>Database artists found in Mark's post: <strong>${matchedInPostTotal.toLocaleString()}</strong></li>
            <li>Database artists flagged <code>markssignatureservice</code>: <strong>${flaggedTotal.toLocaleString()}</strong></li>
            <li>Listed by Mark but not flagged: <strong>${inPostNotFlagged.length.toLocaleString()}</strong></li>
            <li>Flagged but not listed by Mark: <strong>${flaggedNotInPost.length.toLocaleString()}</strong></li>
            <li>Names in post not found in DB: <strong>${unmatchedPostNames.length.toLocaleString()}</strong></li>
          </ul>
          <p style="margin: 10px 0 0 0; font-size: 13px;"><a href="${postUrl}" style="color: #507A60;">View Mark's post</a></p>
        </div>

        ${inPostNotFlaggedSection}
        ${flaggedNotInPostSection}
        ${unmatchedPostNamesSection}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; font-size: 12px; color: #999;">
          <p>
            This is an automated admin report from the Mark's Signature Service Sync job.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};
