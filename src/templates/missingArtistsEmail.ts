import {
  adminFooter, inlineCode, listBox, listItem, palette, panel, renderEmail, sectionLabel, summaryTable,
} from './emailLayout';

interface DbArtist {
  name: string;
  scryfall_name: string;
}

const description = (text: string): string =>
  `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: ${palette.muted};">${text}</p>`;

export const generateScryfallSyncEmail = (
  missingFromDb: string[],
  notOnScryfall: DbArtist[],
  scryfallTotal: number,
  dbTotal: number
): string => {
  const missingFromDbList = missingFromDb.map(name => listItem(name)).join('');

  const notOnScryfallList = notOnScryfall
    .map(artist => listItem(`<strong>${artist.name}</strong> (scryfall_name: ${artist.scryfall_name})`))
    .join('');

  const missingFromDbSection = missingFromDb.length > 0 ? `
    ${sectionLabel('Scryfall Artists Not in Your Database')}
    ${description(`The following ${missingFromDb.length.toLocaleString()} artist names from Scryfall don't have a matching
      ${inlineCode('scryfall_name')} in your database. These may be new artists or ones you haven't mapped yet.`)}
    ${listBox(missingFromDbList)}
  ` : '';

  const notOnScryfallSection = notOnScryfall.length > 0 ? `
    ${sectionLabel('Your Artists Not Found on Scryfall')}
    ${description(`The following ${notOnScryfall.length.toLocaleString()} artists in your database have a ${inlineCode('scryfall_name')}
      that doesn't match any name in Scryfall's list. This may indicate a typo or an artist who has been removed.`)}
    ${listBox(notOnScryfallList, false)}
  ` : '';

  return renderEmail({
    title: 'Scryfall Artist Sync Report',
    eyebrow: 'Admin report',
    heading: 'Scryfall Artist',
    headingMuted: 'Sync Report',
    body: `
      <div style="margin-top: 24px;">
        ${panel(summaryTable([
          ['Scryfall artists', scryfallTotal],
          ['Database artists (with scryfall_name)', dbTotal],
          ['Scryfall artists not in DB', missingFromDb.length],
          ['DB artists not on Scryfall', notOnScryfall.length],
        ]), 'neutral', 0)}
      </div>

      ${missingFromDbSection}
      ${notOnScryfallSection}
    `,
    footer: adminFooter('Scryfall Artist Sync'),
  });
};
