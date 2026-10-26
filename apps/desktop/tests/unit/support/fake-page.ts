import type { RecorderCommand, RecorderEvent, TrackKind } from '../../../src/recorder/protocol';
import type { ChunkPort, RecorderTransport } from '../../../src/main/recording/recorder-host';

export class FakePage implements RecorderTransport {
  readonly sent: RecorderCommand[] = [];
  readonly ports: Partial<Record<TrackKind, FakeChunkPort>> = {};
  private events: ((event: RecorderEvent) => void)[] = [];
  private gone: ((reason: string) => void)[] = [];
  closed = false;
  loadedPromise: Promise<void> = Promise.resolve();
  /** What the page does when it gets a command. */
  reply: (command: RecorderCommand, page: FakePage) => void = () => undefined;
  rendererClock = 1000;

  send(command: RecorderCommand): void {
    this.sent.push(command);
    queueMicrotask(() => {
      this.reply(command, this);
    });
  }
  openChunkPorts(kinds: readonly TrackKind[]): Partial<Record<TrackKind, ChunkPort>> {
    for (const kind of kinds) this.ports[kind] = new FakeChunkPort();
    queueMicrotask(() => {
      this.emit({ type: 'ports-attached', kinds: [...kinds] });
    });
    return this.ports;
  }
  onEvent(callback: (event: RecorderEvent) => void): () => void {
    this.events.push(callback);
    return () => {
      this.events = this.events.filter((entry) => entry !== callback);
    };
  }
  onGone(callback: (reason: string) => void): () => void {
    this.gone.push(callback);
    return () => undefined;
  }
  loaded(): Promise<void> {
    return this.loadedPromise;
  }
  close(): void {
    this.closed = true;
  }
  emit(event: RecorderEvent): void {
    for (const listener of this.events) listener(event);
  }
  die(reason: string): void {
    for (const listener of this.gone) listener(reason);
  }
}

export class FakeChunkPort implements ChunkPort {
  callback: ((value: unknown) => void) | undefined;
  closed = false;
  onMessage(callback: (value: unknown) => void): void {
    this.callback = callback;
  }
  close(): void {
    this.closed = true;
  }
}

export const responder = (): FakePage['reply'] => (command, page) => {
  switch (command.type) {
    case 'configure':
      page.emit({
        type: 'ready',
        tracks: command.tracks.map((track) => ({ kind: track.kind, mimeType: 'video/webm' })),
        failed: [],
        cursor: 'hidden',
      });
      break;
    case 'ping':
      page.rendererClock += 1;
      page.emit({
        type: 'pong',
        id: command.id,
        mainSentAt: command.mainSentAt,
        rendererNow: page.rendererClock,
      });
      break;
    case 'start':
      for (const kind of Object.keys(page.ports) as TrackKind[]) {
        page.emit({ type: 'track-started', kind, rendererNow: 5000 });
      }
      break;
    case 'pause':
      page.emit({ type: 'paused', rendererNow: 7000 });
      break;
    case 'resume':
      page.emit({ type: 'resumed', rendererNow: 9000 });
      break;
    case 'stop':
      page.emit({ type: 'stopped', tracks: [{ kind: 'screen', chunks: 3, bytes: 30 }] });
      break;
  }
};
