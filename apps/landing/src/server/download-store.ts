import 'server-only';
import { Arch, Os } from '@/generated/prisma/enums';
import { getDb } from './db';
import type { DownloadStore } from './downloads';

/** A person is emailed at most once in this long. */
const EMAIL_WINDOW_MS = 60 * 60 * 1000;

const OS = { windows: Os.WINDOWS, macos: Os.MACOS, linux: Os.LINUX } as const;
const ARCH = { x64: Arch.X64, arm64: Arch.ARM64 } as const;

/** The real store: people and downloads in Postgres. */
export function prismaDownloadStore(): DownloadStore {
  return {
    async countRecent(ipHash, since) {
      return getDb().download.count({ where: { ipHash, createdAt: { gte: since } } });
    },

    async record(entry) {
      const db = getDb();
      const person = await db.person.upsert({
        where: { email: entry.email },
        create: { email: entry.email, name: entry.name, updatesOptIn: entry.updatesOptIn },
        // Asking again never turns notices off. Opting in again clears an old unsubscribe.
        update: {
          name: entry.name,
          ...(entry.updatesOptIn ? { updatesOptIn: true, unsubscribedAt: null } : {}),
        },
      });
      const emailed = await db.download.findFirst({
        where: {
          personId: person.id,
          emailSentAt: { gte: new Date(Date.now() - EMAIL_WINDOW_MS) },
        },
        select: { id: true },
      });
      const download = await db.download.create({
        data: {
          personId: person.id,
          os: OS[entry.os],
          arch: entry.arch === null ? null : ARCH[entry.arch],
          version: entry.version,
          ipHash: entry.ipHash,
          userAgent: entry.userAgent,
        },
        select: { id: true },
      });
      return {
        downloadId: download.id,
        unsubscribeToken: person.unsubscribeToken,
        emailedRecently: emailed !== null,
      };
    },

    async markEmailSent(downloadId) {
      await getDb().download.update({
        where: { id: downloadId },
        data: { emailSentAt: new Date() },
      });
    },
  };
}
