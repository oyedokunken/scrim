/**
 * Escapes text the way React does when it renders it, so a test can look for that text in the
 * rendered markup. Every special character is replaced, with the ampersand first.
 */
export function escapeForReact(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
}

/** The text of rendered markup, with every tag skipped in one pass. Only for trusted test output. */
export function textOf(html: string): string {
  let out = '';
  let inTag = false;
  for (const char of html) {
    if (char === '<') {
      inTag = true;
    } else if (char === '>' && inTag) {
      inTag = false;
    } else if (!inTag) {
      out += char;
    }
  }
  return out;
}
