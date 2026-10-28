const BACKSLASH = String.fromCharCode(92);

/**
 * The characters that could end a script element or break a script, and the escapes that replace
 * them. JSON allows these escapes anywhere inside a string, so the data stays the same.
 */
const ESCAPES: Record<string, string> = {
  '<': `${BACKSLASH}u003c`,
  '>': `${BACKSLASH}u003e`,
  '&': `${BACKSLASH}u0026`,
  [String.fromCharCode(0x2028)]: `${BACKSLASH}u2028`,
  [String.fromCharCode(0x2029)]: `${BACKSLASH}u2029`,
};

const UNSAFE = new RegExp(`[${Object.keys(ESCAPES).join('')}]`, 'g');

/**
 * Turns data into JSON that is safe to place inside `<script type="application/ld+json">`.
 * A value such as "</script><script>alert(1)" cannot close the element, because every angle
 * bracket and ampersand is written as an escape.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(UNSAFE, (character) => ESCAPES[character] ?? character);
}

export interface SoftwareApplicationInput {
  name: string;
  description: string;
  siteUrl: string;
  licenseUrl: string;
  author: { name: string; url: string };
}

/** Structured data that tells search engines what Scrim is. */
export function softwareApplicationJsonLd(input: SoftwareApplicationInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: input.name,
    description: input.description,
    url: input.siteUrl,
    operatingSystem: 'Windows',
    applicationCategory: 'MultimediaApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: input.licenseUrl,
    author: { '@type': 'Person', name: input.author.name, url: input.author.url },
  };
}
