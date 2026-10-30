import type { Handlers } from '../ipc/dispatcher';
import type { UpdateController } from './update-controller';

type UpdateHandlers = Pick<
  Handlers,
  'updates:state' | 'updates:check' | 'updates:download' | 'updates:install' | 'app:activity'
>;

/** The update calls. Each one goes to the controller, which decides whether the app may act now. */
export function createUpdateHandlers(controller: UpdateController): UpdateHandlers {
  return {
    'updates:state': () => controller.snapshot(),
    'updates:check': () => controller.check(),
    'updates:download': () => controller.download(),
    'updates:install': () => {
      controller.install();
    },
    'app:activity': ({ editing }) => {
      controller.setEditing(editing);
    },
  };
}
