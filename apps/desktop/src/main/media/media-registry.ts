import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { isInsideRoot } from '../app-protocol';

export const MEDIA_SCHEME = 'scrim-media';

/**
 * The files the page may play. The page never sees a path: it gets an address with a one time
 * token, and the protocol turns the token back into a file. A file is only ever issued, and only
 * ever served, when it sits inside one of the allowed folders (the projects folder and the
 * preview cache). Everything else, including `..` tricks and links that lead outside, is refused.
 */
export class MediaRegistry {
  private readonly files = new Map<string, string>();

  constructor(
    private readonly roots: () => readonly string[],
    private readonly caseInsensitive: boolean,
  ) {}

  /** True when the file, with dot segments folded away, is inside an allowed folder. */
  allows(file: string): boolean {
    const target = resolve(file);
    return this.roots().some((root) => isInsideRoot(resolve(root), target, this.caseInsensitive));
  }

  /** An address for the file, or undefined when it is outside the allowed folders. */
  issue(file: string, label = 'file'): string | undefined {
    if (file.includes('\0') || !this.allows(file)) return undefined;
    const token = randomUUID();
    this.files.set(token, resolve(file));
    return `${MEDIA_SCHEME}://p/${token}/${label}`;
  }

  /** The file behind an address, checked against the folders again. */
  resolve(requestUrl: string): string | undefined {
    let parsed: URL;
    try {
      parsed = new URL(requestUrl);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.host !== 'p') return undefined;
    const token = parsed.pathname.split('/')[1];
    if (token === undefined) return undefined;
    const file = this.files.get(token);
    return file !== undefined && this.allows(file) ? file : undefined;
  }

  /** Forgets every address for a file, for example after it was deleted. */
  forget(file: string): void {
    const target = resolve(file);
    for (const [token, known] of this.files) if (known === target) this.files.delete(token);
  }
}
