import 'server-only';
import { z } from 'zod';
import { getSiteEnv } from './env';

const releaseSchema = z.object({
  draft: z.boolean().optional(),
  tag_name: z.string().min(1),
  html_url: z.url(),
  published_at: z.string().nullable().optional(),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.url(),
      size: z.number().int().nonnegative(),
    }),
  ),
});

const releasesSchema = z.array(releaseSchema);

interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface LatestRelease {
  /** The tag without a leading `v`. */
  version: string;
  /** The release page on GitHub. */
  url: string;
  /** When it was published, as an ISO date and time, or null when GitHub does not say. */
  publishedAt: string | null;
  assets: ReleaseAsset[];
}

/** How long a lookup may take before the page renders without it. */
const TIMEOUT_MS = 2500;
/** Release data is reused for this long. */
export const RELEASE_REVALIDATE_SECONDS = 300;

type FetchLike = (
  input: string,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

/**
 * The newest published GitHub Release, or `null` when there is none or GitHub cannot be reached.
 * It never throws, so a page can always render. It reads the release list rather than the `latest`
 * endpoint, because `latest` answers 404 while the only release is marked a pre release, which
 * sent every visitor to the Releases page. Drafts are skipped. Failures are logged without any
 * request detail.
 */
export async function fetchLatestRelease(
  fetchImpl: FetchLike = fetch,
  site: { GITHUB_REPO: string; GITHUB_TOKEN?: string | undefined } = getSiteEnv(),
): Promise<LatestRelease | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (site.GITHUB_TOKEN !== undefined) {
    headers.Authorization = `Bearer ${site.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${site.GITHUB_REPO}/releases?per_page=10`,
      {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: RELEASE_REVALIDATE_SECONDS },
      },
    );
    if (response.status === 404) {
      return null; // No release has been published yet.
    }
    if (!response.ok) {
      console.warn(`Release lookup failed with status ${response.status}.`);
      return null;
    }
    const parsed = releasesSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.warn('Release lookup returned an unexpected shape.');
      return null;
    }
    const newest = parsed.data.find((release) => release.draft !== true);
    if (newest === undefined) {
      return null; // Only drafts, or nothing, so far.
    }
    return {
      version: newest.tag_name.replace(/^v/i, ''),
      url: newest.html_url,
      publishedAt: newest.published_at ?? null,
      assets: newest.assets.map((asset) => ({
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
      })),
    };
  } catch {
    console.warn('Release lookup could not reach GitHub.');
    return null;
  }
}
