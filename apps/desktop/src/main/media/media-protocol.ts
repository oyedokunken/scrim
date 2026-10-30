import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { MediaRegistry } from './media-registry';

const TYPES: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
};

export interface MediaFs {
  /** The real path with links followed, or undefined when the file is not there. */
  real: (file: string) => Promise<string | undefined>;
  size: (file: string) => Promise<number>;
  read: (file: string, start: number, end: number) => ReadableStream<Uint8Array>;
}

const realMediaFs: MediaFs = {
  real: async (file) => {
    try {
      return await realpath(file);
    } catch {
      return undefined;
    }
  },
  size: async (file) => (await stat(file)).size,
  read: (file, start, end) =>
    Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>,
};

/** `bytes=0-99`, `bytes=100-` and `bytes=-50` for a file of `size` bytes. Undefined when it makes no sense. */
export function parseRange(
  header: string,
  size: number,
): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null || (match[1] === '' && match[2] === '')) return undefined;
  let start: number;
  let end: number;
  if (match[1] === '') {
    const last = Number(match[2]);
    if (last === 0) return undefined;
    start = Math.max(0, size - last);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return undefined;
  return { start, end };
}

function plain(status: number): Response {
  return new Response(null, { status, headers: { 'X-Content-Type-Options': 'nosniff' } });
}

/**
 * Answers a request for a media address. Only GET and HEAD, only files the registry knows and
 * that still resolve inside the allowed folders after links are followed, and ranges so the
 * player can seek.
 */
export async function handleMediaRequest(
  request: Request,
  registry: MediaRegistry,
  fs: MediaFs = realMediaFs,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405);
  const file = registry.resolve(request.url);
  if (file === undefined) return plain(403);
  const real = await fs.real(file);
  if (real === undefined) return plain(404);
  // A link inside the folder that points outside it is not served.
  if (!registry.allows(real)) return plain(403);
  const type = TYPES[extname(real).toLowerCase()];
  if (type === undefined) return plain(404);

  const size = await fs.size(real);
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const wanted = request.headers.get('range');
  if (wanted === null || size === 0) {
    headers['Content-Length'] = String(size);
    return new Response(
      request.method === 'HEAD' || size === 0 ? null : fs.read(real, 0, size - 1),
      { status: 200, headers },
    );
  }
  const range = parseRange(wanted, size);
  if (range === undefined) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${String(size)}` },
    });
  }
  headers['Content-Range'] = `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`;
  headers['Content-Length'] = String(range.end - range.start + 1);
  return new Response(request.method === 'HEAD' ? null : fs.read(real, range.start, range.end), {
    status: 206,
    headers,
  });
}
