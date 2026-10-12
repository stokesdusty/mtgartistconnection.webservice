import {
  adminFooter, inlineCode, listBox, listItem, palette, panel, renderEmail, sectionLabel, summaryTable,
} from './emailLayout';

interface UrlMismatch {
  name: string;
  currentUrl: string;
  expectedUrl: string;
}

interface UnmatchedArtist {
  name: string;
  url: string;
}

interface StaleDbLink {
  name: string;
  url: string;
}

const description = (text: string): string =>
  `<p style="margin: 0 0 12px; font-size: 14px; line-height: 1.55; color: ${palette.muted};">${text}</p>`;

export const generateMountainMageSyncEmail = (
  urlMismatches: UrlMismatch[],
  unmatchedArtists: UnmatchedArtist[],
  staleDbLinks: StaleDbLink[],
  mountainMageTotal: number,
  dbTotal: number
): string => {
  const field = inlineCode('mountainmage');
  const urlStyle = `font-size: 12px; color: ${palette.muted}; word-break: break-all;`;

  const urlMismatchesList = urlMismatches
    .map(artist => listItem(`<strong>${artist.name}</strong><br><span style="${urlStyle}">current: ${artist.currentUrl || '(not set)'}<br>expected: ${artist.expectedUrl}</span>`))
    .join('');

  const unmatchedArtistsList = unmatchedArtists
    .map(artist => listItem(`<strong>${artist.name}</strong> <span style="${urlStyle}">(${artist.url})</span>`))
    .join('');

  const staleDbLinksList = staleDbLinks
    .map(artist => listItem(`<strong>${artist.name}</strong> <span style="${urlStyle}">(${artist.url})</span>`))
    .join('');

  const urlMismatchesSection = urlMismatches.length > 0 ? `
    ${sectionLabel('Mountain Mage URL Mismatches')}
    ${description(`The following ${urlMismatches.length.toLocaleString()} artists have a ${field} value in your
      database that doesn't match the URL currently listed on Mountain Mage Signatures.`)}
    ${listBox(urlMismatchesList)}
  ` : '';

  const unmatchedArtistsSection = unmatchedArtists.length > 0 ? `
    ${sectionLabel('Mountain Mage Artists Not Found in Your Database')}
    ${description(`The following ${unmatchedArtists.length.toLocaleString()} artists have a page on Mountain Mage Signatures but
      no artist in your database matches their name or has their Mountain Mage link.`)}
    ${listBox(unmatchedArtistsList)}
  ` : '';

  const staleDbLinksSection = staleDbLinks.length > 0 ? `
    ${sectionLabel('Database Links Not Found on Mountain Mage')}
    ${description(`The following ${staleDbLinks.length.toLocaleString()} artists have a ${field} link in your
      database that doesn't match any artist page currently listed on Mountain Mage Signatures.`)}
    ${listBox(staleDbLinksList, false)}
  ` : '';

  return renderEmail({
    title: 'Mountain Mage Signatures Sync Report',
    eyebrow: 'Admin report',
    heading: 'Mountain Mage Signatures',
    headingMuted: 'Sync Report',
    body: `
      <div style="margin-top: 24px;">
        ${panel(summaryTable([
          ['Mountain Mage artists', mountainMageTotal],
          ['Database artists', dbTotal],
          ['URL mismatches', urlMismatches.length],
          ['Mountain Mage artists not matched in DB', unmatchedArtists.length],
          ['DB links not found on Mountain Mage', staleDbLinks.length],
        ]), 'neutral', 0)}
      </div>

      ${urlMismatchesSection}
      ${unmatchedArtistsSection}
      ${staleDbLinksSection}
    `,
    footer: adminFooter('Mountain Mage Signatures Sync'),
  });
};
