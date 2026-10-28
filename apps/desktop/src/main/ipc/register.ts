import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { CHANNELS, type EventChannel } from '../../shared/channels';
import { events, type EventPayload } from '../../shared/ipc-contract';
import { isOwnUrl } from '../permissions';
import { createDispatcher, type DispatcherOptions, type SenderInfo } from './dispatcher';

/** The sender frame of a call. It is null when the frame is gone, which the dispatcher rejects. */
function senderOf(event: IpcMainInvokeEvent): SenderInfo | null {
  const frame = event.senderFrame;
  if (frame === null) return null;
  return { frameUrl: frame.url, isMainFrame: frame === event.sender.mainFrame };
}

/** Registers one handler per channel in the contract, all through the same dispatcher. */
export function registerIpc(options: DispatcherOptions): void {
  const dispatch = createDispatcher(options);
  for (const channel of CHANNELS) {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      dispatch(channel, senderOf(event), args),
    );
  }
}

/**
 * Sends an event to a window after checking the payload against the contract. A page that is
 * not ours, or a payload that does not fit, is dropped rather than sent.
 */
export function sendEvent<E extends EventChannel>(
  contents: WebContents,
  allowedOrigin: string,
  channel: E,
  payload: EventPayload<E>,
): boolean {
  if (contents.isDestroyed() || !isOwnUrl(contents.getURL(), allowedOrigin)) return false;
  const parsed = events[channel].safeParse(payload);
  if (!parsed.success) return false;
  contents.send(channel, parsed.data);
  return true;
}
