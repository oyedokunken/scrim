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
