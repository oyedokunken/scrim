import { parseChunkMessage } from '../../recorder/protocol-schemas';
import type {
  ChunkMessage,
  RecorderCommand,
  RecorderEvent,
  TrackKind,
  TrackRequest,
} from '../../recorder/protocol';
import { estimateOffset, type ClockOffset, type PingSample } from './clock-sync';

/** The main side of one chunk port. */
export interface ChunkPort {
  onMessage(callback: (value: unknown) => void): void;
  close(): void;
}

/** The window and its channels, as the host sees them. The real one wraps a BrowserWindow. */
export interface RecorderTransport {
  send(command: RecorderCommand): void;
  /** Makes one port pair per kind, keeps one end and gives the other to the page. */
  openChunkPorts(kinds: readonly TrackKind[]): Partial<Record<TrackKind, ChunkPort>>;
  onEvent(callback: (event: RecorderEvent) => void): () => void;
  /** The recorder page process died. */
  onGone(callback: (reason: string) => void): () => void;
  /** Resolves when the page has loaded and is listening for commands. */
  loaded(): Promise<void>;
  close(): void;
}

export type ReadyEvent = Extract<RecorderEvent, { type: 'ready' }>;

export type HostError =
  | { code: 'timeout'; waitingFor: string }
  | { code: 'page-gone'; reason: string }
  | { code: 'closed' };

/** A failure of the host itself, with a code the service turns into a message. */
export class HostFailure extends Error {
  readonly detail: HostError;
  constructor(detail: HostError) {
    super(
      detail.code === 'timeout'
        ? `The recorder did not answer: ${detail.waitingFor}.`
        : detail.code === 'page-gone'
          ? `The recorder stopped unexpectedly: ${detail.reason}.`
          : 'The recorder was closed.',
    );
    this.name = 'HostFailure';
    this.detail = detail;
  }
}

export interface HostOptions {
  transport: RecorderTransport;
  /** The main clock in milliseconds. */
  now: () => number;
  /** Called for events nobody is waiting for: track ended, track error, fatal. */
  onUnsolicited?: (event: RecorderEvent) => void;
  /** Called when the page process dies, whether or not anything was waiting on it. */
  onPageGone?: (reason: string) => void;
  /** Waiting limits. Capturing the screen can be slow, so `ready` gets longer. */
  timeouts?: { readyMs?: number; replyMs?: number };
}

const DEFAULT_READY_MS = 30_000;
const DEFAULT_REPLY_MS = 10_000;

type Waiter = {
  matches: (event: RecorderEvent) => boolean;
  resolve: (event: RecorderEvent) => void;
};

/**
 * Drives the recorder page: configure it, give it chunk ports, measure the clock, start, pause,
 * resume and stop it, each as a command and the matching reply. Every wait has a timeout and ends
 * early with an error if the page dies, so a hung or crashed recorder never hangs the app.
 */
export class RecorderHost {
  private readonly transport: RecorderTransport;
  private readonly now: () => number;
  private readonly onUnsolicited: ((event: RecorderEvent) => void) | undefined;
  private readonly onPageGone: ((reason: string) => void) | undefined;
  private readonly readyMs: number;
  private readonly replyMs: number;
  private readonly waiters = new Set<Waiter>();
  private readonly rejecters = new Set<(error: HostFailure) => void>();
  private readonly unsubscribe: (() => void)[] = [];
  private ports: Partial<Record<TrackKind, ChunkPort>> = {};
  private closed = false;
  private pingId = 0;

  constructor(options: HostOptions) {
    this.transport = options.transport;
    this.now = options.now;
    this.onUnsolicited = options.onUnsolicited;
    this.onPageGone = options.onPageGone;
    this.readyMs = options.timeouts?.readyMs ?? DEFAULT_READY_MS;
    this.replyMs = options.timeouts?.replyMs ?? DEFAULT_REPLY_MS;
    this.unsubscribe.push(
      this.transport.onEvent((event) => {
        this.dispatch(event);
      }),
      this.transport.onGone((reason) => {
        this.failAll(new HostFailure({ code: 'page-gone', reason }));
        this.onPageGone?.(reason);
      }),
    );
  }

  /** Opens the screen, camera and microphone that were asked for. */
  async configure(
    tracks: readonly TrackRequest[],
    settings: { timesliceMs: number; screenBitsPerSecond: number },
  ): Promise<ReadyEvent> {
    await this.within(this.transport.loaded(), this.readyMs, 'the recorder page to load');
    const reply = this.expect('ready', (event) => event.type === 'ready', this.readyMs);
    this.transport.send({ type: 'configure', tracks, ...settings });
    const event = await reply;
    if (event.type !== 'ready') throw new HostFailure({ code: 'closed' });
    return event;
  }

  /** Gives the page one port per track and routes what arrives on them to `onChunk`. */
  async attachPorts(
    kinds: readonly TrackKind[],
    onChunk: (chunk: ChunkMessage) => void,
    onBadChunk: (kind: TrackKind, detail: string) => void,
  ): Promise<void> {
    const reply = this.expect(
      'the chunk ports',
      (event) => event.type === 'ports-attached',
      this.replyMs,
    );
    this.ports = this.transport.openChunkPorts(kinds);
    for (const kind of kinds) {
      this.ports[kind]?.onMessage((value) => {
        const chunk = parseChunkMessage(value);
        if (chunk === undefined || chunk.track !== kind) onBadChunk(kind, describeValue(value));
        else onChunk(chunk);
      });
    }
    await reply;
  }

  /** Pings the page several times and keeps the sample with the smallest round trip. */
  async syncClock(rounds = 8): Promise<ClockOffset> {
    const samples: PingSample[] = [];
    for (let round = 0; round < rounds; round += 1) {
      this.pingId += 1;
      const id = this.pingId;
      const sentAt = this.now();
      const reply = this.expect(
        'a clock ping',
        (event) => event.type === 'pong' && event.id === id,
        this.replyMs,
      );
      this.transport.send({ type: 'ping', id, mainSentAt: sentAt });
      const event = await reply;
      const receivedAt = this.now();
      if (event.type === 'pong')
        samples.push({ sentAt, receivedAt, rendererNow: event.rendererNow });
    }
    const offset = estimateOffset(samples);
    if (offset === undefined)
      throw new HostFailure({ code: 'timeout', waitingFor: 'a clock ping' });
    return offset;
  }

  /** Starts every recorder and resolves with the page clock time at which each one started. */
  async start(
    kinds: readonly TrackKind[],
  ): Promise<Map<TrackKind, { startedAt: number; calledAt: number }>> {
    const waits = kinds.map((kind) =>
      this.expect(
        `the ${kind} recorder to start`,
        (event) => event.type === 'track-started' && event.kind === kind,
        this.replyMs,
      ),
    );
    this.transport.send({ type: 'start' });
    const started = new Map<TrackKind, { startedAt: number; calledAt: number }>();
    for (const event of await Promise.all(waits)) {
      if (event.type === 'track-started') {
        started.set(event.kind, { startedAt: event.rendererNow, calledAt: event.calledAt });
      }
    }
    return started;
  }

  /** Pauses every recorder. Resolves with the page clock time of the pause. */
  async pause(): Promise<number> {
    const reply = this.expect('the pause', (event) => event.type === 'paused', this.replyMs);
    this.transport.send({ type: 'pause' });
    const event = await reply;
    return event.type === 'paused' ? event.rendererNow : 0;
  }

  /** Resumes every recorder. Resolves with the page clock time of the resume. */
  async resume(): Promise<number> {
    const reply = this.expect('the resume', (event) => event.type === 'resumed', this.replyMs);
    this.transport.send({ type: 'resume' });
    const event = await reply;
    return event.type === 'resumed' ? event.rendererNow : 0;
  }

  /** Stops every recorder and waits until the last chunk has been sent. */
  async stop(): Promise<Extract<RecorderEvent, { type: 'stopped' }>['tracks']> {
    const reply = this.expect(
      'the recorders to stop',
      (event) => event.type === 'stopped',
      this.replyMs,
    );
    this.transport.send({ type: 'stop' });
    const event = await reply;
    return event.type === 'stopped' ? event.tracks : [];
  }

  /** Closes the chunk ports and the window. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const port of Object.values(this.ports)) port.close();
    this.ports = {};
    for (const stop of this.unsubscribe) stop();
    this.failAll(new HostFailure({ code: 'closed' }));
    this.transport.close();
  }

  private within(work: Promise<void>, timeoutMs: number, description: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.rejecters.delete(fail);
        reject(new HostFailure({ code: 'timeout', waitingFor: description }));
      }, timeoutMs);
      const fail = (error: HostFailure) => {
        clearTimeout(timer);
        reject(error);
      };
      this.rejecters.add(fail);
      work.then(
        () => {
          clearTimeout(timer);
          this.rejecters.delete(fail);
          resolve();
        },
        (error: unknown) => {
          clearTimeout(timer);
          this.rejecters.delete(fail);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }

  private dispatch(event: RecorderEvent): void {
    for (const waiter of this.waiters) {
      if (waiter.matches(event)) {
        this.waiters.delete(waiter);
        waiter.resolve(event);
        return;
      }
    }
    this.onUnsolicited?.(event);
  }

  private failAll(error: HostFailure): void {
    for (const reject of [...this.rejecters]) reject(error);
    this.rejecters.clear();
    this.waiters.clear();
  }

  private expect(
    description: string,
    matches: (event: RecorderEvent) => boolean,
    timeoutMs: number,
  ): Promise<RecorderEvent> {
    if (this.closed) return Promise.reject(new HostFailure({ code: 'closed' }));
    return new Promise<RecorderEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        this.rejecters.delete(fail);
        reject(new HostFailure({ code: 'timeout', waitingFor: description }));
      }, timeoutMs);
      const fail = (error: HostFailure) => {
        clearTimeout(timer);
        reject(error);
      };
      const waiter: Waiter = {
        matches,
        resolve: (event) => {
          clearTimeout(timer);
          this.rejecters.delete(fail);
          resolve(event);
        },
      };
      this.waiters.add(waiter);
      this.rejecters.add(fail);
    });
  }
}

/** A short description of a value that failed validation, for the log. It never includes the data. */
function describeValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) return typeof value;
  const fields = Object.entries(value)
    .map(([key, entry]) => `${key}: ${Object.prototype.toString.call(entry)}`)
    .join(', ');
  return `{ ${fields} }`;
}
