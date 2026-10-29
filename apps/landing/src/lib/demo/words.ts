/** The sentence that animates in on the tagline card, split so each word can arrive in turn. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}
