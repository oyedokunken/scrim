import { ToastProvider } from '../ui';
import { CloseQuestion } from './shell/close-question';
import { routeFromHash } from './routes';
import { ControlScreen, MainScreen } from './screens';

/** One page, two windows: the recording control at `#/control`, the app everywhere else. */
export function App() {
  return routeFromHash(window.location.hash) === 'control' ? (
    <ControlScreen />
  ) : (
    <ToastProvider>
      <MainScreen />
      <CloseQuestion />
    </ToastProvider>
  );
}
