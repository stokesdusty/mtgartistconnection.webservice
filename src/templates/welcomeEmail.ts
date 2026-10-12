import { SITE_URL } from './siteUrl';
import { button, palette, renderEmail, sectionLabel, subscriberFooter, textLink } from './emailLayout';

const STEPS = [
  {
    title: 'Follow artists',
    body: `Follow your favorites from any artist page. We'll email you when their profile is updated or they're added to a signing event.`,
    link: [`${SITE_URL}/`, 'Browse artists'],
  },
  {
    title: 'Monitor states',
    body: 'Pick the states you care about on your Following page and hear about new local signing events first.',
    link: [`${SITE_URL}/following`, 'Choose states'],
  },
  {
    title: 'Track your cards',
    body: 'Mark cards as signed, wishlisted, or artist proofs, and keep tabs on batches you send out with the signing tracker.',
    link: [`${SITE_URL}/yourcards`, 'Your cards'],
  },
];

export const generateWelcomeEmail = (): string => {
  const steps = STEPS.map(({ title, body, link: [href, label] }, i) => `
    <tr>
      <td valign="top" style="width: 34px; padding: ${i === 0 ? '0' : '18px'} 14px 0 0;">
        <div style="width: 32px; height: 32px; line-height: 32px; text-align: center; background-color: ${palette.glow}; border: 1px solid #cfe0d5; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${palette.accentText};">${i + 1}</div>
      </td>
      <td valign="top" style="padding: ${i === 0 ? '0' : '18px'} 0 0;">
        <p style="margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; color: ${palette.fg};">${title}</p>
        <p style="margin: 4px 0 6px; font-size: 14px; line-height: 1.55; color: ${palette.muted};">${body}</p>
        <span style="font-size: 13px;">${textLink(href, `${label} &rarr;`)}</span>
      </td>
    </tr>
  `).join('');

  return renderEmail({
    title: 'Welcome to MTG Artist Connection',
    preheader: 'Follow artists, monitor local signings, and track your cards.',
    eyebrow: 'Account created',
    heading: 'Welcome to the',
    headingMuted: 'vault.',
    intro: `Thanks for joining MTG Artist Connection. We're your resource for Magic: The Gathering artists: social profiles, signature examples, full card portfolios with current pricing, a signing event calendar, and trusted mail-in signing services.`,
    body: `
      ${sectionLabel('Getting started')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${steps}
      </table>

      <div style="margin-top: 32px;">
        ${button(`${SITE_URL}/`, 'Browse Artists')}
      </div>
    `,
    footer: subscriberFooter(
      `All emails are opt-in. We only email you about artists you follow, events in states you monitor, and site updates you've turned on. We never sell your data.`,
      [[`${SITE_URL}/settings`, 'Manage email preferences'], [SITE_URL, 'Visit MTG Artist Connection']],
    ),
  });
};
