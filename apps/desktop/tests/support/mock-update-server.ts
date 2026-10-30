/** A local update server for tests. It imports nothing from the app, so unit and end to end tests share it. */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockRelease {
  version: string;
  file: Buffer;
  /** Written into latest.yml. Defaults to the real checksum of `file`. */
  sha512?: string;
  notes?: string;
}

export interface MockServer {
  url: string;
  /** Every path that was requested, so a test can see what was asked for and what was not. */
  requests: string[];
  close: () => Promise<void>;
}

export const sha512Of = (data: Buffer): string =>
  createHash('sha512').update(data).digest('base64');

/** Serves `latest.yml` and one file, the way a GitHub release does. No other path exists. */
export async function startMockUpdateServer(release: MockRelease | null): Promise<MockServer> {
  const requests: string[] = [];
  const name = `Scrim-Setup-${release?.version ?? '0'}.exe`;
  const server: Server = createServer((request, response) => {
    // The real updater adds a cache busting query to latest.yml. Routing ignores it.
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    requests.push(path);
    if (release === null) {
      response.writeHead(404).end('not found');
    } else if (path === '/latest.yml') {
      const lines = [
        `version: ${release.version}`,
        'files:',
        `  - url: ${name}`,
        `    sha512: ${release.sha512 ?? sha512Of(release.file)}`,
        `    size: ${String(release.file.length)}`,
        `path: ${name}`,
        `releaseDate: '2026-10-30T10:00:00.000Z'`,
      ];
      if (release.notes !== undefined) lines.push(`releaseNotes: ${JSON.stringify(release.notes)}`);
      response.writeHead(200, { 'content-type': 'text/yaml' }).end(`${lines.join('\n')}\n`);
    } else if (path === `/${name}`) {
      response
        .writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': String(release.file.length),
        })
        .end(release.file);
    } else {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
