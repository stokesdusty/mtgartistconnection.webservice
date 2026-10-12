import {
  adminFooter, inlineCode, listBox, listItem, palette, panel, renderEmail, sectionLabel, summaryTable, textLink,
} from './emailLayout';

interface InPostNotFlagged {
  name: string;
  matchedAs: string;
}

interface FlaggedNotInPost {
  name: string;
}

const description = (text: string): string =>
  `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: ${palette.muted};">${text}</p>`;

export const generateMarksSignatureSyncEmail = (
  inPostNotFlagged: InPostNotFlagged[],
  flaggedNotInPost: FlaggedNotInPost[],
  unmatchedPostNames: string[],
  matchedInPostTotal: number,
  flaggedTotal: number,
  postUrl: string
): string => {
  const flag = inlineCode('markssignatureservice');

  const inPostNotFlaggedList = inPostNotFlagged
    .map(artist => listItem(`<strong>${artist.name}</strong>${artist.matchedAs !== artist.name ? ` (listed as "${artist.matchedAs}")` : ''}`))
    .join('');

  const flaggedNotInPostList = flaggedNotInPost
    .map(artist => listItem(`<strong>${artist.name}</strong>`))
    .join('');

  const unmatchedPostNamesList = unmatchedPostNames
    .map(name => listItem(`<strong>${name}</strong>`))
    .join('');

  const inPostNotFlaggedSection = inPostNotFlagged.length > 0 ? `
    ${sectionLabel('Listed by Mark but Not Flagged')}
    ${description(`The following ${inPostNotFlagged.length.toLocaleString()} artists appear in Mark's post but don't have
      ${flag} set to ${inlineCode('true')} in your database.`)}
    ${listBox(inPostNotFlaggedList)}
  ` : '';

  const flaggedNotInPostSection = flaggedNotInPost.length > 0 ? `
    ${sectionLabel('Flagged but Not Listed by Mark')}
    ${description(`The following ${flaggedNotInPost.length.toLocaleString()} artists have ${flag} set to
      ${inlineCode('true')} in your database, but neither their name nor any alternate name appears in Mark's post.`)}
    ${listBox(flaggedNotInPostList)}
  ` : '';

  const unmatchedPostNamesSection = unmatchedPostNames.length > 0 ? `
    ${sectionLabel(`Names in Mark's Post Not Found in Your Database`)}
    ${description(`The following ${unmatchedPostNames.length.toLocaleString()} names were parsed from Mark's post but don't match any
      artist name or alternate name in your database. These are often misspellings — consider adding them as
      ${inlineCode('alternate_names')}, or to the job's ignore list.`)}
    ${listBox(unmatchedPostNamesList, false)}
  ` : '';

  return renderEmail({
    title: `Mark's Signature Service Sync Report`,
    eyebrow: 'Admin report',
    heading: `Mark's Signature Service`,
    headingMuted: 'Sync Report',
    body: `
      <div style="margin-top: 24px;">
        ${panel(`
          ${summaryTable([
            [`Database artists found in Mark's post`, matchedInPostTotal],
            [`Database artists flagged ${flag}`, flaggedTotal],
            ['Listed by Mark but not flagged', inPostNotFlagged.length],
            ['Flagged but not listed by Mark', flaggedNotInPost.length],
            ['Names in post not found in DB', unmatchedPostNames.length],
          ])}
          <p style="margin: 12px 0 0; font-size: 13px;">${textLink(postUrl, `View Mark's post &rarr;`)}</p>
        `, 'neutral', 0)}
      </div>

      ${inPostNotFlaggedSection}
      ${flaggedNotInPostSection}
      ${unmatchedPostNamesSection}
    `,
    footer: adminFooter(`Mark's Signature Service Sync`),
  });
};
