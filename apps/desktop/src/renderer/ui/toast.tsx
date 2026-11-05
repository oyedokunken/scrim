import { X } from 'lucide-react';
import { Button } from './button';
import { Tooltip } from './tooltip';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const TOAST_MS = 4000;
/** A toast with a button stays longer, so there is time to press it. */
const TOAST_ACTION_MS = 9000;

/** One button on a toast, such as Show in folder. */
interface ToastAction {
  label: string;
  run: () => void;
}

/** What a toast can carry beside its title. */
interface ToastOptions {
  /** The line under the title. */
  text?: string | undefined;
  /** A button under the text, such as Show in folder. */
  action?: ToastAction | undefined;
}

interface ToastItem extends ToastOptions {
  id: number;
  title: string;
}

type Notify = (title: string, options?: ToastOptions) => void;

const ToastContext = createContext<Notify | null>(null);

/** Shows a confirmation at the bottom right. Call it from any screen below the provider. */
export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (notify === null) throw new Error('useToast needs a ToastProvider.');
  return notify;
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        onClose(item.id);
      },
      item.action === undefined ? TOAST_MS : TOAST_ACTION_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [item.id, item.action, onClose]);

  return (
    <div className="ui-toast">
      <div className="ui-toast-head">
        <p className="ui-toast-title">{item.title}</p>
        <Tooltip label="Close" side="bottom-end">
          <button
            type="button"
            className="ui-toast-close"
            aria-label="Close"
            onClick={() => {
              onClose(item.id);
            }}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {item.text === undefined || item.text === '' ? null : (
        <p className="ui-toast-text">{item.text}</p>
      )}
      {item.action === undefined ? null : (
        <div className="ui-toast-actions">
          <Button
            variant="secondary"
            onClick={() => {
              item.action?.run();
              onClose(item.id);
            }}
          >
            {item.action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const close = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>((title, options) => {
    const id = next.current;
    next.current += 1;
    setItems((current) => [...current.slice(-3), { id, title, ...options }]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="ui-toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
