import dns from 'dns/promises';
import net from 'net';

const NAVIGATION_TIMEOUT_MS = 20000;

// Admin-only, but still guard against SSRF: block the resolved IP from
// reaching loopback/private/link-local ranges (the last of which covers the
// 169.254.169.254 cloud metadata endpoint) before Puppeteer ever navigates.
function isPrivateOrMetadataIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
    if (lower.startsWith('fe80:')) return true; // link-local
    return false;
  }

  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true; // malformed, fail closed

  const [a, b] = octets;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http/https URLs are allowed');
  }

  let address: string;
  try {
    ({ address } = await dns.lookup(url.hostname));
  } catch {
    throw new Error('Could not resolve hostname');
  }

  if (isPrivateOrMetadataIp(address)) {
    throw new Error('URL resolves to a disallowed private/internal address');
  }

  return url;
}

export interface RenderedPage {
  text: string;
  finalUrl: string;
}

export async function renderPageText(rawUrl: string): Promise<RenderedPage> {
  const url = await assertSafeUrl(rawUrl);

  // Puppeteer ships ESM-only; this project compiles to CommonJS, so it must
  // be loaded via dynamic import() rather than a static import.
  const { default: puppeteer } = await import('puppeteer');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; MTGArtistConnectionBot/1.0)');
    await page.goto(url.toString(), {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const text = await page.evaluate(() => document.body.innerText);
    const finalUrl = page.url();
    return { text, finalUrl };
  } finally {
    await browser.close();
  }
}
