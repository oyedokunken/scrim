import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { APP_HOST, APP_SCHEME } from './renderer-target';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

export function contentTypeFor(file: string): string | undefined {
  return CONTENT_TYPES[extname(file).toLowerCase()];
}

function hasUnsafeSegments(path: string): boolean {
  if (path.includes('\0') || path.includes('\\')) return true;
  if (path.startsWith('//') || /^\/?[a-zA-Z]:/.test(path)) return true;
  return path.split('/').some((segment) => segment === '..');
}

export type ResolvedPath = { ok: true; file: string } | { ok: false; status: 403 | 404 };

/**
 * Maps a request URL to a file inside the renderer root. Anything that could leave the root
 * (dot segments in any encoding, backslashes, drive letters, UNC paths, null bytes) is a 403.
 * A type that is not in the explicit map is a 404.
 */
export function resolveRendererPath(root: string, requestUrl: string): ResolvedPath {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return { ok: false, status: 403 };
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) {
    return { ok: false, status: 403 };
  }

  // The URL parser folds dot segments away before this code sees them. Check the raw text
  // too, so an attempt is refused instead of quietly rewritten. Decode a few times to catch
  // double encoding.
  const rawPath = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(requestUrl)?.[1] ?? '';
  let decoded = rawPath;
  for (let pass = 0; pass < 3; pass += 1) {
    if (hasUnsafeSegments(decoded)) return { ok: false, status: 403 };
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return { ok: false, status: 403 };
    }
  }
  if (hasUnsafeSegments(decoded)) return { ok: false, status: 403 };

  const relative = decoded === '/' || decoded === '' ? 'index.html' : decoded.replace(/^\/+/, '');
  const rootPath = resolve(root);
  const file = resolve(rootPath, relative);
  if (file !== rootPath && !file.startsWith(rootPath + sep)) return { ok: false, status: 403 };
  if (contentTypeFor(file) === undefined) return { ok: false, status: 404 };
  return { ok: true, file };
}

function textResponse(status: number, body: string, csp: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Serves one request from the renderer folder with the CSP and a fixed content type. */
export async function handleAppRequest(
  request: Request,
  root: string,
  csp: string,
): Promise<Response> {
  const resolved = resolveRendererPath(root, request.url);
  if (!resolved.ok) {
    return textResponse(resolved.status, resolved.status === 403 ? 'Forbidden' : 'Not found', csp);
  }
  try {
    const body = await readFile(resolved.file);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(resolved.file) ?? 'application/octet-stream',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return textResponse(404, 'Not found', csp);
  }
}
