export type Route = 'control' | 'main';

/**
 * Which screen a window shows. The small recording control is the same page opened at `#/control`,
 * so both windows share one bundle and one policy. Anything else is the main app.
 */
export function routeFromHash(hash: string): Route {
  return hash === '#/control' ? 'control' : 'main';
}
