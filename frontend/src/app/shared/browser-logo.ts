/** Logos de navegadores (paquete browser-logos en cdnjs). */
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1';

const BROWSER_SLUGS: Record<string, string> = {
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  safari: 'safari',
  opera: 'opera',
  'opera gx': 'opera-gx',
  brave: 'brave',
  'samsung internet': 'samsung-internet',
  vivaldi: 'vivaldi',
  yandex: 'yandex',
  'uc browser': 'uc',
  duckduckgo: 'duckduckgo',
  chromium: 'chromium',
  'internet explorer': 'internet-explorer_9-11',
};

/** URL del logo del navegador, o null si no es uno de los conocidos. */
export function browserLogo(name: string | null | undefined): string | null {
  const slug = BROWSER_SLUGS[(name ?? '').trim().toLowerCase()];
  return slug ? `${CDN}/${slug}/${slug}_48x48.png` : null;
}
