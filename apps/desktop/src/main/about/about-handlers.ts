import type { About, SystemInfo } from '../../shared/about-contract';
import type { Handlers } from '../ipc/dispatcher';

type AboutHandlers = Pick<Handlers, 'app:about' | 'system:info'>;

export interface AboutApi {
  about: () => Promise<About>;
  system: () => SystemInfo;
}

/**
 * The two About calls. They take no logger on purpose: the computer's name must never reach the
 * log, and a handler that cannot log cannot leak it.
 */
export function createAboutHandlers(api: AboutApi): AboutHandlers {
  return {
    'app:about': () => api.about(),
    'system:info': () => api.system(),
  };
}
