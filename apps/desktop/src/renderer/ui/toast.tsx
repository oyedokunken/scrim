import { X } from 'lucide-react';
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

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction | undefined;
}

type Notify = (message: string, action?: ToastAction) => void;

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
      <span>{item.message}</span>
      {item.action === undefined ? null : (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            item.action?.run();
            onClose(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <Tooltip label="Dismiss">
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss"
          onClick={() => {
            onClose(item.id);
          }}
        >
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const close = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>((message, action) => {
    const id = next.current;
    next.current += 1;
    setItems((current) => [...current.slice(-3), { id, message, action }]);
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
