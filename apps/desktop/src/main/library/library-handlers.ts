import type { Handlers } from '../ipc/dispatcher';
import type { Library } from './library';

type LibraryHandlers = Pick<
  Handlers,
  | 'library:list'
  | 'library:thumbnail'
  | 'library:open'
  | 'library:rename'
  | 'library:reveal'
  | 'library:delete'
  | 'library:share'
  | 'share:available'
>;

/** The library calls. Every one works on an id the last listing handed out, so no path comes from the page. */
export function createLibraryHandlers(deps: {
  library: Library;
  canShare: () => boolean;
}): LibraryHandlers {
  const { library } = deps;
  return {
    'library:list': () => library.list(),
    'library:thumbnail': ({ id }) => library.thumbnail(id),
    'library:open': ({ id }) => library.open(id),
    'library:rename': ({ id, name }) => library.rename(id, name),
    'library:reveal': ({ id }) => {
      library.reveal(id);
    },
    'library:delete': ({ id }) => library.remove(id),
    'library:share': ({ id }) => {
      if (!deps.canShare()) throw new Error('sharing is not available');
      return library.share(id);
    },
    'share:available': () => deps.canShare(),
  };
}
