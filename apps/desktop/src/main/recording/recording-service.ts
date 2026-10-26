import {
  nextPhase,
  rawTrackFile,
  sanitizeName,
  toMediaTime,
  SESSION_FILES,
  type Pause,
  type RecorderEvent as PhaseEvent,
  type RecorderPhase,
  type SessionFile,
  type TrackKind,
} from '@scrim/core';
import { join } from 'node:path';
import type { RecorderEvent } from '../../recorder/protocol';
import { ChunkWriter, type WriterFailure } from './chunk-writer';
import { assessDisk, DISK_FLOORS } from './disk-space';
import type { FfmpegPaths, RunProcess } from './ffmpeg';
import { finalizeSession } from './finalize';
import type { ServiceFs } from './fs-adapter';
import { InputRecorder } from './input-recorder';
import type { InputSource } from './input-source';
import { errnoOf, errorFromFs, makeError, WARNINGS } from './messages';
import { rendererToMain, type ClockOffset } from './clock-sync';
import { HostFailure, type RecorderHost } from './recorder-host';
import { readSession, writeSession, type SessionIndex } from './session-store';
import type {
  FinishedRecording,
  Outcome,
  RecordingError,
  RecordingEvent,
  RecordingOptions,
  RecordingSnapshot,
  RecoverableSession,
  ResolvedSource,
  SourceSpec,
  Warning,
} from './types';

export interface ServiceDeps {
  fs: ServiceFs;
  /** Milliseconds from a steady clock. Only differences matter. */
  now: () => number;
  wallNow: () => Date;
  uuid: () => string;
  app: { version: string; os: 'windows' | 'macos' | 'linux'; arch: 'x64' | 'arm64'; pid: number };
  /** Opens a fresh hidden recorder. The callbacks are for events nobody is waiting for. */
  createHost: (callbacks: {
    onUnsolicited: (event: RecorderEvent) => void;
    onPageGone: (reason: string) => void;
  }) => RecorderHost;
  createInputSource: () => InputSource;
  run: RunProcess;
  ffmpeg: FfmpegPaths;
  /** Works out where a display or window is on the desktop. */
  resolveSource: (spec: SourceSpec) => Promise<Outcome<ResolvedSource>>;
  /** Tells the display media handler what to capture, or clears it. */
  setCaptureTarget: (spec: SourceSpec | undefined) => void;
  defaultDestination: () => string;
  index: SessionIndex;
  isProcessAlive: (pid: number) => boolean;
  log: (message: string) => void;
  timers: {
    setInterval: (callback: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
  /** Waiting limits, so tests can be quick. */
  waits?: { chunkDrainMs?: number };
}

interface Active {
  folder: string;
  destination: string;
  session: SessionFile;
  host: RecorderHost;
  writers: Map<TrackKind, ChunkWriter>;
  received: Map<TrackKind, number>;
  ended: Set<TrackKind>;
  input: InputRecorder | undefined;
  offset: ClockOffset;
  /** The main clock when `start` was called. Every time in the session is relative to it. */
  origin: number;
  pauses: Pause[];
  warnings: Warning[];
  heartbeat: unknown;
  ticks: number;
  lowDiskWarned: boolean;
  /** Set when something forces a stop, so `stop` can report why. */
  forced: RecordingError | undefined;
  stopping: boolean;
  /** A heartbeat is running, so the next tick is skipped rather than piling up. */
  beating: boolean;
  /** Session file writes run one after another, so two never share the temporary file. */
  writes: Promise<void>;
}

const HEARTBEAT_MS = 1000;
const DISK_CHECK_EVERY_TICKS = 10;
const TIMESLICE_MS = 1000;
const SCREEN_BITS_PER_SECOND = 12_000_000;
const CHUNK_DRAIN_MS = 5000;
const WAIT_STEP_MS = 20;

/** A dated name that is the same on every system: `Scrim 2026-10-26 18.20.05`. */
export function defaultName(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `Scrim ${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

/**
 * Records the screen, camera and microphone into a session folder that survives a crash, and
 * turns it into playable files when it stops. It owns the recording clock, the session file and
 * its heartbeat, the writers and the mouse log. It answers every call with a value, never a throw,
 * and reports what happens through events. The phases come from the reducer in `@scrim/core`.
 */
export class RecordingService {
  private readonly deps: ServiceDeps;
  private readonly listeners = new Set<(event: RecordingEvent) => void>();
  private phase: RecorderPhase = 'idle';
  private active: Active | undefined;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  on(listener: (event: RecordingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): RecordingSnapshot {
    const active = this.active;
    if (active === undefined) {
      return { phase: this.phase, elapsedMs: 0, bytesWritten: 0, tracks: [], warnings: [] };
    }
    const bytes = [...active.writers.values()].reduce(
      (sum, writer) => sum + writer.stats.bytesWritten,
      0,
    );
    return {
      phase: this.phase,
      elapsedMs: this.elapsed(active),
      bytesWritten: bytes + (active.input?.bytesWritten ?? 0),
      tracks: active.session.tracks.map((track) => ({
        kind: track.kind,
        bytesWritten: active.writers.get(track.kind)?.stats.bytesWritten ?? track.bytesWritten,
        ended: active.ended.has(track.kind),
      })),
      warnings: [...active.warnings],
      folder: active.folder,
    };
  }

  /** Starts a recording. Resolves once recording has begun, or with why it could not. */
  async start(options: RecordingOptions): Promise<Outcome<{ folder: string }>> {
    // A finished or failed recording leaves the phase where it ended. The next one starts afresh.
    if (this.phase === 'stopped' || this.phase === 'failed') this.move('reset');
    const moved = this.move('start');
    if (!moved.ok) return moved;
    this.emitState();

    const { deps } = this;
    const destination = options.destination ?? deps.defaultDestination();
    const name = sanitizeName(options.name ?? defaultName(deps.wallNow()));
    let active: Active | undefined;
    try {
      const resolved = await deps.resolveSource(options.source);
      if (!resolved.ok) return await this.failStart(active, resolved.error);

      const folderResult = await this.prepareFolder(destination, name);
      if (!folderResult.ok) return await this.failStart(active, folderResult.error);

      active = this.createActive(folderResult.value, destination, name, resolved.value);
      await writeSession(deps.fs, active.folder, active.session);
      await deps.index.add(active.folder);
      deps.setCaptureTarget(options.source);

      const opened = await this.openTracks(active, options);
      if (!opened.ok) return await this.failStart(active, opened.error);

      active.offset = await active.host.syncClock();
      active.session.clock = {
        rendererOffsetMs: active.offset.offsetMs,
        uncertaintyMs: active.offset.uncertaintyMs,
      };
      await this.startInput(active);

      const kinds = [...active.writers.keys()];
      const started = await active.host.start(kinds);
      for (const track of active.session.tracks) {
        const at = started.get(track.kind);
        if (at !== undefined)
          track.startedAt = Math.max(0, rendererToMain(at, active.offset) - active.origin);
      }
      this.active = active;
      this.move('started');
      const recording = active;
      active.heartbeat = deps.timers.setInterval(() => {
        void this.heartbeat(recording);
      }, HEARTBEAT_MS);
      await this.writeHeartbeat(active);
      this.emitState();
      return { ok: true, value: { folder: active.folder } };
    } catch (error) {
      return await this.failStart(active, this.classify(error, 'start'));
    }
  }

  async pause(): Promise<Outcome<void>> {
    const active = this.active;
    if (active === undefined) return this.invalid();
    const moved = this.move('pause');
    if (!moved.ok) return moved;
    try {
      const rendererNow = await active.host.pause();
      const at = Math.max(0, rendererToMain(rendererNow, active.offset) - active.origin);
      active.pauses.push({ pausedAt: at, resumedAt: null });
      active.session.pauses = [...active.pauses];
      await active.input?.pause();
      await Promise.all([...active.writers.values()].map((writer) => writer.flush()));
      await this.writeHeartbeat(active);
      this.emitState();
      return { ok: true, value: undefined };
    } catch (error) {
      return this.crashed(active, error);
    }
  }

  async resume(): Promise<Outcome<void>> {
    const active = this.active;
    if (active === undefined) return this.invalid();
    const moved = this.move('resume');
    if (!moved.ok) return moved;
    try {
      const rendererNow = await active.host.resume();
      const at = Math.max(0, rendererToMain(rendererNow, active.offset) - active.origin);
      const open = active.pauses.at(-1);
      if (open?.resumedAt === null) open.resumedAt = Math.max(at, open.pausedAt);
      active.session.pauses = [...active.pauses];
      active.input?.resume();
      await this.writeHeartbeat(active);
      this.emitState();
      return { ok: true, value: undefined };
    } catch (error) {
      return this.crashed(active, error);
    }
  }

  /** Stops, writes everything out and makes the playable files. */
  async stop(): Promise<Outcome<FinishedRecording>> {
    const active = this.active;
    if (active === undefined) return this.invalid();
    const moved = this.move('stop');
    if (!moved.ok) return moved;
    return this.finish(active, undefined);
  }

  /** Sessions that never closed cleanly and whose app is no longer running. */
  async listRecoverable(): Promise<RecoverableSession[]> {
    const { deps } = this;
    const found: RecoverableSession[] = [];
    for (const folder of await deps.index.list()) {
      if (this.active?.folder === folder) continue;
      const read = await readSession(deps.fs, folder);
      if (!read.ok) continue;
      const { session } = read;
      if (session.cleanClose || this.isRunningElsewhere(session.pid)) continue;
      found.push({
        folder,
        name: session.name,
        createdAt: session.createdAt,
        bytes: session.tracks.reduce((sum, track) => sum + track.bytesWritten, 0),
      });
    }
    return found;
  }

  /**
   * Finishes a crashed recording: remux the raw tracks, convert the mouse log up to its last whole
   * line, close any open pause at the last heartbeat and mark the session closed and recovered.
   * The raw files are never changed.
   */
  async recover(folder: string): Promise<Outcome<FinishedRecording>> {
    const { deps } = this;
    const read = await readSession(deps.fs, folder);
    if (!read.ok) return { ok: false, error: makeError('nothing-recoverable', read.reason) };
    if (read.session.cleanClose) {
      return { ok: false, error: makeError('invalid-state', 'already closed') };
    }
    if (this.isRunningElsewhere(read.session.pid)) {
      return { ok: false, error: makeError('invalid-state', 'still running') };
    }
    const finished = await finalizeSession(
      { fs: deps.fs, run: deps.run, paths: deps.ffmpeg, log: deps.log },
      {
        folder,
        session: read.session,
        endMs: read.session.heartbeatElapsedMs,
        recovered: true,
      },
    ).catch((error: unknown) => ({ ok: false as const, error: this.classify(error, 'recording') }));
    if (!finished.ok) return finished;
    await deps.index.remove(folder).catch(() => undefined);
    return { ok: true, value: finished.value.result };
  }

  /** Stops offering a session for recovery. Nothing on disk is touched except the index entry. */
  async dismiss(folder: string): Promise<void> {
    await this.deps.index.remove(folder);
  }

  /** Another copy of the app is still recording into it. Our own process id is never "elsewhere". */
  private isRunningElsewhere(pid: number): boolean {
    return pid !== this.deps.app.pid && this.deps.isProcessAlive(pid);
  }

  // The rest of the file is the machinery behind those calls.

  private move(event: PhaseEvent): Outcome<void> {
    const next = nextPhase(this.phase, event);
    if (!next.ok) return this.invalid(`${this.phase} cannot ${event}`);
    this.phase = next.value;
    return { ok: true, value: undefined };
  }

  private invalid(detail?: string): { ok: false; error: RecordingError } {
    return { ok: false, error: makeError('invalid-state', detail) };
  }

  private emit(event: RecordingEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private emitState(): void {
    this.emit({ type: 'state', snapshot: this.snapshot() });
  }

  private warn(active: Active, warning: Warning): void {
    active.warnings.push(warning);
    active.session.warnings.push(warning.message);
    this.emit({ type: 'warning', warning });
  }

  private elapsed(active: Active): number {
    const screen = active.session.tracks.find((track) => track.kind === 'screen');
    const start = screen?.startedAt ?? 0;
    const mainNow = this.deps.now() - active.origin;
    return Math.max(0, Math.round(toMediaTime(mainNow, start, active.pauses)));
  }

  private classify(error: unknown, when: 'start' | 'recording'): RecordingError {
    if (error instanceof HostFailure) {
      return error.detail.code === 'page-gone'
        ? makeError('recorder-crashed', error.detail.reason)
        : makeError('recorder-failed', error.message);
    }
    if (errnoOf(error) !== undefined) return errorFromFs(error, when);
    return makeError('unknown', error instanceof Error ? error.message : undefined);
  }

  /** Where a recording is saved, made unique and writable. */
  private async prepareFolder(destination: string, name: string): Promise<Outcome<string>> {
    const { fs } = this.deps;
    try {
      await fs.mkdir(destination);
      if (assessDisk(await fs.freeBytes(destination), 'start') === 'refuse') {
        return { ok: false, error: makeError('disk-too-full') };
      }
      let folder = join(destination, `${name}.scrim`);
      for (let n = 2; await fs.exists(folder); n += 1) {
        folder = join(destination, `${name} ${String(n)}.scrim`);
      }
      await fs.mkdir(folder);
      return { ok: true, value: folder };
    } catch (error) {
      return { ok: false, error: errorFromFs(error, 'start') };
    }
  }

  private createActive(
    folder: string,
    destination: string,
    name: string,
    source: ResolvedSource,
  ): Active {
    const { deps } = this;
    const session: SessionFile = {
      version: 1,
      id: deps.uuid(),
      name,
      createdAt: deps.wallNow().toISOString(),
      app: { version: deps.app.version, os: deps.app.os, arch: deps.app.arch },
      pid: deps.app.pid,
      source: {
        kind: source.kind,
        ...(source.displayId === undefined ? {} : { displayId: source.displayId }),
        ...(source.crop === undefined ? {} : { crop: source.crop }),
        origin: source.origin,
        scaleFactor: source.scaleFactor,
      },
      capture: { cursor: 'unknown' },
      tracks: [],
      clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
      pauses: [],
      input: { status: 'unavailable', reason: 'error' },
      warnings: [],
      heartbeatAt: deps.wallNow().toISOString(),
      heartbeatElapsedMs: 0,
      cleanClose: false,
    };
    // The host is created with callbacks that look the recording up when they fire.
    const active: Active = {
      folder,
      destination,
      session,
      host: deps.createHost({
        onUnsolicited: (event) => {
          this.onUnsolicited(active, event);
        },
        onPageGone: (reason) => {
          void this.onPageGone(active, reason);
        },
      }),
      writers: new Map(),
      received: new Map(),
      ended: new Set(),
      input: undefined,
      offset: { offsetMs: 0, uncertaintyMs: 0 },
      origin: deps.now(),
      pauses: [],
      warnings: [],
      heartbeat: undefined,
      ticks: 0,
      lowDiskWarned: false,
      forced: undefined,
      stopping: false,
      beating: false,
      writes: Promise.resolve(),
    };
    return active;
  }

  private async openTracks(active: Active, options: RecordingOptions): Promise<Outcome<void>> {
    const { deps } = this;
    const requests: { kind: TrackKind; deviceId?: string | undefined }[] = [{ kind: 'screen' }];
    if (options.camera.enabled)
      requests.push({ kind: 'camera', deviceId: options.camera.deviceId });
    if (options.mic.enabled) requests.push({ kind: 'mic', deviceId: options.mic.deviceId });

    const ready = await active.host.configure(requests, {
      timesliceMs: TIMESLICE_MS,
      screenBitsPerSecond: SCREEN_BITS_PER_SECOND,
    });

    const screenFailure = ready.failed.find((failure) => failure.kind === 'screen');
    if (screenFailure !== undefined || !ready.tracks.some((track) => track.kind === 'screen')) {
      const code =
        screenFailure?.reason === 'permission-denied' ? 'screen-permission' : 'screen-unavailable';
      return { ok: false, error: makeError(code, screenFailure?.message) };
    }
    for (const failure of ready.failed) {
      if (failure.kind === 'camera' || failure.kind === 'mic') {
        this.warn(active, WARNINGS.deviceUnavailable(failure.kind));
      }
    }

    active.session.capture = { cursor: ready.cursor };
    if (ready.cursor !== 'hidden') this.warn(active, WARNINGS.cursorVisible());
    if (ready.frame !== undefined) active.session.source.frame = ready.frame;

    for (const track of ready.tracks) {
      const file = rawTrackFile(track.kind, track.mimeType);
      const sink = await deps.fs.openAppend(join(active.folder, file));
      active.writers.set(
        track.kind,
        new ChunkWriter({
          sink,
          clock: { now: deps.now },
          onFailure: (failure) => {
            void this.onWriterFailure(active, track.kind, failure);
          },
        }),
      );
      active.session.tracks.push({
        kind: track.kind,
        file,
        mimeType: track.mimeType,
        startedAt: 0,
        bytesWritten: 0,
        complete: false,
      });
    }

    await active.host.attachPorts(
      [...active.writers.keys()],
      (chunk) => {
        active.received.set(chunk.track, (active.received.get(chunk.track) ?? 0) + 1);
        void active.writers.get(chunk.track)?.write({
          seq: chunk.seq,
          byteLength: chunk.byteLength,
          mediaTimeMs: chunk.mediaTimeMs,
          data: new Uint8Array(chunk.data),
        });
      },
      (kind) => {
        deps.log(`A malformed chunk arrived on the ${kind} port and was ignored.`);
      },
    );
    return { ok: true, value: undefined };
  }

  private async startInput(active: Active): Promise<void> {
    const { deps } = this;
    const input = new InputRecorder({
      source: deps.createInputSource(),
      clock: { now: () => deps.now() - active.origin },
      openWriter: async () => {
        const sink = await deps.fs.openAppend(join(active.folder, SESSION_FILES.input));
        return new ChunkWriter({ sink, clock: { now: deps.now } });
      },
    });
    const result = await input.start();
    if (result.status === 'started') {
      active.input = input;
      active.session.input = { status: 'recorded', file: SESSION_FILES.input };
      return;
    }
    active.session.input = { status: 'unavailable', reason: result.reason };
    this.warn(active, WARNINGS.inputUnavailable(result.reason));
    if (result.detail !== undefined) deps.log(`The mouse log is off: ${result.detail}`);
  }

  private async heartbeat(active: Active): Promise<void> {
    if (active.stopping || this.active !== active || active.beating) return;
    active.beating = true;
    try {
      await this.beat(active);
    } finally {
      active.beating = false;
    }
  }

  private async beat(active: Active): Promise<void> {
    active.ticks += 1;
    active.input?.tick();
    await this.writeHeartbeat(active);
    if (active.ticks % DISK_CHECK_EVERY_TICKS === 0) await this.checkDisk(active);
    for (const writer of active.writers.values()) {
      if (writer.stats.queuedBytes > 64 * 1024 * 1024) this.warn(active, WARNINGS.writerSlow());
    }
    this.emitState();
  }

  private async writeHeartbeat(active: Active): Promise<void> {
    const { session } = active;
    for (const track of session.tracks) {
      const writer = active.writers.get(track.kind);
      if (writer !== undefined) track.bytesWritten = writer.stats.bytesWritten;
    }
    session.heartbeatAt = this.deps.wallNow().toISOString();
    session.heartbeatElapsedMs = Math.max(0, Math.round(this.deps.now() - active.origin));
    session.pauses = [...active.pauses];
    try {
      await this.persist(active);
    } catch (error) {
      await this.forceStop(active, this.classify(error, 'recording'));
    }
  }

  /** Writes `session.json` after any write already under way. The snapshot is taken now. */
  private persist(active: Active): Promise<void> {
    const snapshot = structuredClone(active.session);
    const run = active.writes.then(() => writeSession(this.deps.fs, active.folder, snapshot));
    active.writes = run.catch(() => undefined);
    return run;
  }

  private async checkDisk(active: Active): Promise<void> {
    let free: number;
    try {
      free = await this.deps.fs.freeBytes(active.destination);
    } catch {
      return;
    }
    const verdict = assessDisk(free, 'recording');
    if (verdict === 'stop') await this.forceStop(active, makeError('disk-full', String(free)));
    else if (verdict === 'warn' && !active.lowDiskWarned) {
      active.lowDiskWarned = true;
      this.warn(active, WARNINGS.diskLow(free));
    } else if (verdict === 'ok' && free > DISK_FLOORS.startMinBytes) active.lowDiskWarned = false;
  }

  private onUnsolicited(active: Active, event: RecorderEvent): void {
    switch (event.type) {
      case 'track-ended': {
        if (active.stopping) return;
        if (event.kind === 'screen') {
          void this.forceStop(active, makeError('display-removed'));
          return;
        }
        active.ended.add(event.kind);
        const track = active.session.tracks.find((entry) => entry.kind === event.kind);
        if (track !== undefined) track.endedReason = 'device-removed';
        this.warn(active, WARNINGS.deviceLost(event.kind));
        this.emitState();
        return;
      }
      case 'track-error':
        this.deps.log(`The ${event.kind} recorder reported an error: ${event.message}`);
        if (event.kind === 'screen')
          void this.forceStop(active, makeError('recorder-failed', event.message));
        return;
      case 'fatal':
        void this.forceStop(active, makeError('recorder-failed', event.message));
        return;
      default:
        return;
    }
  }

  private async onWriterFailure(
    active: Active,
    kind: TrackKind,
    failure: WriterFailure,
  ): Promise<void> {
    const error = errorFromFs(
      Object.assign(new Error(failure.message), { code: failure.code }),
      'recording',
    );
    this.deps.log(`The ${kind} writer failed: ${failure.code ?? failure.message}`);
    const track = active.session.tracks.find((entry) => entry.kind === kind);
    if (track !== undefined) {
      track.endedReason =
        failure.code === 'ENOSPC'
          ? 'disk-full'
          : error.code === 'folder-unavailable'
            ? 'folder-unavailable'
            : 'error';
    }
    if (kind === 'screen') await this.forceStop(active, error);
  }

  /** Something outside the user's control ended the recording. Save what there is. */
  private async forceStop(active: Active, error: RecordingError): Promise<void> {
    if (active.stopping || this.active !== active) return;
    active.forced = error;
    const moved = this.move('stop');
    if (!moved.ok) return;
    await this.finish(active, error);
  }

  private async onPageGone(active: Active, reason: string): Promise<void> {
    if (this.active !== active || active.stopping) return;
    await this.crashed(active, new HostFailure({ code: 'page-gone', reason }));
  }

  /**
   * The recorder page died. Close the writers so what arrived is on disk, stop the mouse log, write
   * the heartbeat and leave the session marked as not closed, so it is offered for recovery.
   */
  private async crashed(
    active: Active,
    cause: unknown,
  ): Promise<{ ok: false; error: RecordingError }> {
    const error = this.classify(cause, 'recording');
    if (active.stopping && this.phase === 'failed') return { ok: false, error };
    active.stopping = true;
    this.deps.timers.clearInterval(active.heartbeat);
    this.phase = 'failed';
    await this.closeEverything(active);
    this.deps.setCaptureTarget(undefined);
    this.active = undefined;
    this.emit({ type: 'error', error: makeError('recorder-crashed', error.detail) });
    this.emit({ type: 'state', snapshot: { ...this.snapshotAfter(active), phase: 'failed' } });
    return { ok: false, error: makeError('recorder-crashed', error.detail) };
  }

  private snapshotAfter(active: Active): RecordingSnapshot {
    return {
      phase: this.phase,
      elapsedMs: this.elapsed(active),
      bytesWritten: active.session.tracks.reduce((sum, track) => sum + track.bytesWritten, 0),
      tracks: active.session.tracks.map((track) => ({
        kind: track.kind,
        bytesWritten: track.bytesWritten,
        ended: active.ended.has(track.kind),
      })),
      warnings: [...active.warnings],
      folder: active.folder,
    };
  }

  /** Flush and close every writer and the mouse log, then write the last heartbeat. Never throws. */
  private async closeEverything(active: Active): Promise<void> {
    try {
      await active.input?.stop();
    } catch (error) {
      this.deps.log(`The input log did not close cleanly: ${String(error)}`);
    }
    await Promise.all(
      [...active.writers.values()].map((writer) =>
        writer.close().catch((error: unknown) => {
          this.deps.log(`A writer did not close cleanly: ${String(error)}`);
        }),
      ),
    );
    for (const track of active.session.tracks) {
      const writer = active.writers.get(track.kind);
      if (writer !== undefined) track.bytesWritten = writer.stats.bytesWritten;
    }
    active.session.heartbeatAt = this.deps.wallNow().toISOString();
    active.session.heartbeatElapsedMs = Math.max(0, Math.round(this.deps.now() - active.origin));
    active.session.pauses = [...active.pauses];
    try {
      await this.persist(active);
    } catch (error) {
      this.deps.log(`The last heartbeat could not be written: ${String(error)}`);
    }
    active.host.close();
  }

  private async finish(
    active: Active,
    forced: RecordingError | undefined,
  ): Promise<Outcome<FinishedRecording>> {
    active.stopping = true;
    this.deps.timers.clearInterval(active.heartbeat);
    const { deps } = this;
    try {
      const counts = await active.host.stop().catch(() => undefined);
      if (counts !== undefined) await this.waitForChunks(active, counts);
    } catch (error) {
      deps.log(`The recorder did not stop cleanly: ${String(error)}`);
    }
    const endMs = Math.max(0, Math.round(deps.now() - active.origin));
    await this.closeEverything(active);
    deps.setCaptureTarget(undefined);

    const finalized = await finalizeSession(
      { fs: deps.fs, run: deps.run, paths: deps.ffmpeg, log: deps.log },
      { folder: active.folder, session: active.session, endMs, recovered: false },
    ).catch((error: unknown) => ({ ok: false as const, error: this.classify(error, 'recording') }));

    this.active = undefined;
    if (!finalized.ok) {
      this.phase = 'failed';
      // What forced the stop is the cause the user needs to hear about, so it comes first.
      this.emit({ type: 'error', error: forced ?? finalized.error });
      this.emit({ type: 'state', snapshot: { ...this.snapshotAfter(active), phase: 'failed' } });
      return finalized;
    }
    await deps.index.remove(active.folder).catch(() => undefined);
    this.move('stopped');
    const result = finalized.value.result;
    this.emit({ type: 'state', snapshot: { ...this.snapshotAfter(active), phase: 'stopped' } });
    if (forced !== undefined) this.emit({ type: 'error', error: forced });
    this.emit({ type: 'finished', result });
    return { ok: true, value: result };
  }

  /** The last chunks can arrive on their ports after the page says it stopped, so wait for them. */
  private async waitForChunks(
    active: Active,
    counts: { kind: TrackKind; chunks: number }[],
  ): Promise<void> {
    const limit = this.deps.waits?.chunkDrainMs ?? CHUNK_DRAIN_MS;
    const missing = (): boolean =>
      counts.some((entry) => (active.received.get(entry.kind) ?? 0) < entry.chunks);
    // Real time, counted in steps: the injected clock is for the recording, and may stand still.
    for (let waited = 0; missing() && waited < limit; waited += WAIT_STEP_MS) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
    }
    if (missing()) this.deps.log('Some chunks had not arrived when the recorder stopped.');
  }

  private async failStart(
    active: Active | undefined,
    error: RecordingError,
  ): Promise<{ ok: false; error: RecordingError }> {
    this.deps.setCaptureTarget(undefined);
    if (active !== undefined) {
      active.stopping = true;
      await this.closeEverything(active);
      // Nothing was recorded, so there is nothing to recover. Close the session and stop listing it.
      active.session.cleanClose = true;
      active.session.warnings.push('The recording did not start.');
      await this.persist(active).catch(() => undefined);
      await this.deps.index.remove(active.folder).catch(() => undefined);
    }
    this.phase = 'failed';
    this.emit({ type: 'error', error });
    this.emitState();
    // A failed start can be tried again, so the phase goes back to idle.
    this.move('reset');
    this.active = undefined;
    this.emitState();
    return { ok: false, error };
  }
}
