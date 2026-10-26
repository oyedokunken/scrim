// Runs once when the server starts, so a missing variable stops the app with a readable
// message instead of failing on the first visitor.
export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { getServerEnv } = await import('@/server/env');
    getServerEnv();
  }
}
