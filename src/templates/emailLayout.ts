import { SITE_URL } from './siteUrl';

// Light "Vault" palette from the site (design-tokens.ts), flattened to solid hex
// because many email clients drop rgba() borders and backgrounds.
export const palette = {
  bg: '#f5f2ed',
  surface: '#ffffff',
  line: '#e8e3dc',
  lineStrong: '#dcd5cb',
  fg: '#1a1714',
  muted: '#5f5850',
  faint: '#8a8279',
  accent: '#2d6a46',
  accentText: '#245638',
  onAccent: '#ffffff',
  glow: '#f1f6f3',
  warn: '#9a520f',
  warnBg: '#faf1e8',
  info: '#2f6497',
  infoBg: '#f1f5f9',
};

export const fonts = {
  sans: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

type Tone = 'accent' | 'warn' | 'info' | 'neutral';

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  accent: { fg: palette.accentText, bg: palette.glow, border: '#cfe0d5' },
  warn: { fg: palette.warn, bg: palette.warnBg, border: '#efd5bb' },
  info: { fg: palette.info, bg: palette.infoBg, border: '#cfdcea' },
  neutral: { fg: palette.muted, bg: palette.bg, border: palette.line },
};

/** Geist Mono uppercase label, used for eyebrows and section headings. */
export const monoLabel = (text: string, color: string = palette.faint, size = 11): string =>
  `<span style="font-family: ${fonts.mono}; font-size: ${size}px; line-height: 1.4; letter-spacing: 0.14em; text-transform: uppercase; color: ${color};">${text}</span>`;

/** Section heading: mono label with a hairline underneath. */
export const sectionLabel = (text: string): string => `
  <div style="margin: 28px 0 12px; padding-bottom: 8px; border-bottom: 1px solid ${palette.line};">
    ${monoLabel(text)}
  </div>
`;

export const button = (href: string, label: string): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
    <tr>
      <td style="border-radius: 9px; background-color: ${palette.accent};">
        <a href="${href}" style="display: inline-block; padding: 13px 26px; font-family: ${fonts.sans}; font-size: 15px; font-weight: 600; color: ${palette.onAccent}; text-decoration: none; border-radius: 9px;">${label}</a>
      </td>
    </tr>
  </table>
`;

export const textLink = (href: string, label: string): string =>
  `<a href="${href}" style="color: ${palette.accentText}; text-decoration: none; font-weight: 600;">${label}</a>`;

/** Rounded inset box. `tone` tints the background for callouts. */
export const panel = (content: string, tone: Tone = 'neutral', marginBottom = 12): string => {
  const { bg, border } = tone === 'neutral'
    ? { bg: palette.surface, border: palette.line }
    : TONES[tone];
  return `
    <div style="margin: 0 0 ${marginBottom}px; padding: 16px 18px; background-color: ${bg}; border: 1px solid ${border}; border-radius: 12px;">
      ${content}
    </div>
  `;
};

/** Pill-shaped tag, like the site's FilterChip / GlowPill. */
export const chip = (text: string, tone: Tone = 'neutral', bold = false): string => {
  const t = TONES[tone];
  return `<span style="display: inline-block; margin: 0 6px 6px 0; padding: 4px 10px; background-color: ${t.bg}; border: 1px solid ${t.border}; border-radius: 999px; font-family: ${fonts.sans}; font-size: 12px; font-weight: ${bold ? 700 : 500}; line-height: 1.4; color: ${t.fg};">${text}</span>`;
};

/** Small mono badge for status markers ("NEW ARTIST ADDED"). */
export const badge = (text: string, tone: Tone = 'warn'): string => {
  const t = TONES[tone];
  return `<span style="display: inline-block; padding: 3px 8px; background-color: ${t.bg}; border: 1px solid ${t.border}; border-radius: 6px; font-family: ${fonts.mono}; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: ${t.fg}; vertical-align: middle;">${text}</span>`;
};

/** Label/value rows for admin report summaries. Counts render as `>N<` inside <strong>. */
export const summaryTable = (rows: [string, string | number][]): string => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
    ${rows.map(([label, value], i) => `
      <tr>
        <td style="padding: 8px 0; ${i > 0 ? `border-top: 1px solid ${palette.line};` : ''} font-size: 14px; color: ${palette.muted};">${label}</td>
        <td align="right" style="padding: 8px 0; ${i > 0 ? `border-top: 1px solid ${palette.line};` : ''} font-family: ${fonts.mono}; font-size: 14px; color: ${palette.fg};"><strong>${typeof value === 'number' ? value.toLocaleString() : value}</strong></td>
      </tr>
    `).join('')}
  </table>
`;

/** Scrollable bordered list used by the admin reports. */
export const listBox = (items: string, marginBottom = true): string => `
  <div style="max-height: 300px; overflow-y: auto; padding: 12px 14px; background-color: ${palette.bg}; border: 1px solid ${palette.line}; border-radius: 10px;${marginBottom ? ' margin-bottom: 8px;' : ''}">
    <ul style="margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.5; color: ${palette.fg};">
      ${items}
    </ul>
  </div>
`;

export const listItem = (content: string): string => `<li style="margin-bottom: 6px;">${content}</li>`;

export const inlineCode = (text: string): string =>
  `<code style="font-family: ${fonts.mono}; font-size: 12px; padding: 1px 5px; background-color: ${palette.bg}; border: 1px solid ${palette.line}; border-radius: 4px;">${text}</code>`;

interface EmailLayoutOptions {
  /** <title> and the hidden inbox preview text. */
  title: string;
  preheader?: string;
  /** Small mono line above the heading. */
  eyebrow: string;
  heading: string;
  /** Trailing part of the heading rendered in the faint color, as on the site ("Join the <faint>vault.</faint>"). */
  headingMuted?: string;
  intro?: string;
  body: string;
  footer: string;
}

export const renderEmail = ({
  title,
  preheader,
  eyebrow,
  heading,
  headingMuted,
  intro,
  body,
  footer,
}: EmailLayoutOptions): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light">
      <meta name="supported-color-schemes" content="light">
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 0; background-color: ${palette.bg}; font-family: ${fonts.sans}; color: ${palette.fg}; -webkit-font-smoothing: antialiased;">
      ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${preheader}</div>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${palette.bg};">
        <tr>
          <td align="center" style="padding: 32px 16px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
              <!-- Wordmark -->
              <tr>
                <td style="padding: 0 4px 18px;">
                  <a href="${SITE_URL}" style="text-decoration: none;">${monoLabel('MTG Artist Connection', palette.accentText, 12)}</a>
                </td>
              </tr>

              <!-- Card -->
              <tr>
                <td style="background-color: ${palette.surface}; border: 1px solid ${palette.line}; border-radius: 14px; padding: 36px 32px 32px;">
                  <div style="margin-bottom: 14px;">${monoLabel(eyebrow, palette.accentText, 11)}</div>
                  <h1 style="margin: 0; font-family: ${fonts.sans}; font-size: 32px; line-height: 1.1; font-weight: 600; letter-spacing: -0.03em; color: ${palette.fg};">
                    ${heading}${headingMuted ? ` <span style="color: ${palette.faint};">${headingMuted}</span>` : ''}
                  </h1>
                  ${intro ? `<p style="margin: 14px 0 0; font-size: 15px; line-height: 1.6; color: ${palette.muted};">${intro}</p>` : ''}

                  ${body}
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 24px 8px 0; text-align: center; font-size: 12px; line-height: 1.6; color: ${palette.faint};">
                  ${footer}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

/** Footer for subscriber emails: preference links, why-you-got-this, copyright. */
export const subscriberFooter = (reason: string, links: [string, string][]): string => `
  <p style="margin: 0 0 10px;">
    ${links.map(([href, label]) => `<a href="${href}" style="color: ${palette.muted}; text-decoration: underline;">${label}</a>`).join(` <span style="color: ${palette.faint};">&middot;</span> `)}
  </p>
  <p style="margin: 0 0 10px;">${reason}</p>
  <p style="margin: 0;">&copy; ${new Date().getFullYear()} MTG Artist Connection</p>
`;

export const adminFooter = (jobName: string): string => `
  <p style="margin: 0;">This is an automated admin report from the ${jobName} job.</p>
`;
