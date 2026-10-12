import { SITE_URL } from './siteUrl';
import { button, palette, renderEmail, subscriberFooter } from './emailLayout';

export const generateNewArtistDigestEmail = (artistNames: string[]): string => {
  const artistList = artistNames.map((name, i) => {
    const profileUrl = `${SITE_URL}/artist/${encodeURIComponent(name)}`;
    const divider = i > 0 ? `border-top: 1px solid ${palette.line};` : '';
    return `
      <tr>
        <td style="padding: 12px 0; ${divider}">
          <a href="${profileUrl}" style="font-size: 16px; font-weight: 600; color: ${palette.fg}; text-decoration: none;">${name}</a>
        </td>
        <td align="right" style="padding: 12px 0; ${divider}">
          <a href="${profileUrl}" style="font-size: 13px; font-weight: 600; color: ${palette.accentText}; text-decoration: none;">View &rarr;</a>
        </td>
      </tr>
    `;
  }).join('');

  const artistCount = artistNames.length;
  const artistWord = artistCount === 1 ? 'artist has' : 'artists have';

  return renderEmail({
    title: 'New artists added',
    preheader: `${artistCount} new ${artistWord} been added to MTG Artist Connection.`,
    eyebrow: `New artists &middot; ${artistCount}`,
    heading: 'Fresh',
    headingMuted: 'faces.',
    intro: `${artistCount} new ${artistWord} been added to MTG Artist Connection today:`,
    body: `
      <div style="margin-top: 20px; padding: 4px 20px; background-color: ${palette.surface}; border: 1px solid ${palette.line}; border-radius: 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
          ${artistList}
        </table>
      </div>

      <div style="margin-top: 28px;">
        ${button(`${SITE_URL}/artists`, 'Browse All Artists')}
      </div>
    `,
    footer: subscriberFooter(
      `You're receiving this email because you have new artist notifications enabled.`,
      [[`${SITE_URL}/settings`, 'Manage email preferences'], [SITE_URL, 'Visit MTG Artist Connection']],
    ),
  });
};
