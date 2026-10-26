import {
  PORTS_MESSAGE_TYPE,
  type RecorderCommand,
  type RecorderEvent,
  type TrackKind,
} from '../protocol';
import {
  RecorderController,
  type MediaStreamLike,
  type MediaTrackLike,
  type PortLike,
} from './controller';
import type { RecorderLike } from './track-recorder';

declare global {
  interface Window {
    /** Exposed by the recorder preload. */
    scrimRecorder: {
      onCommand(callback: (command: RecorderCommand) => void): void;
      sendEvent(event: RecorderEvent): void;
    };
  }
}

const streams = new WeakMap<MediaStreamLike, MediaStream>();

function adaptTrack(track: MediaStreamTrack): MediaTrackLike {
  return {
    get label() {
      return track.label;
    },
    getSettings: () => track.getSettings(),
    stop: () => {
      track.stop();
    },
    get onended(): (() => void) | null {
      return null;
    },
    set onended(callback: (() => void) | null) {
      track.onended =
        callback === null
          ? null
          : () => {
              callback();
            };
    },
  };
}

function adaptStream(stream: MediaStream): MediaStreamLike {
  const adapted: MediaStreamLike = {
    getVideoTracks: () => stream.getVideoTracks().map(adaptTrack),
    getAudioTracks: () => stream.getAudioTracks().map(adaptTrack),
  };
  streams.set(adapted, stream);
  return adapted;
}

function adaptRecorder(recorder: MediaRecorder): RecorderLike {
  return {
    get state() {
      return recorder.state;
    },
    get ondataavailable(): RecorderLike['ondataavailable'] {
      return null;
    },
    set ondataavailable(callback) {
      recorder.ondataavailable =
        callback === null
          ? null
          : (event) => {
              callback({ data: event.data });
            };
    },
    get onstart(): RecorderLike['onstart'] {
      return null;
    },
    set onstart(callback) {
      recorder.onstart =
        callback === null
          ? null
          : () => {
              callback();
            };
    },
    get onstop(): RecorderLike['onstop'] {
      return null;
    },
    set onstop(callback) {
      recorder.onstop =
        callback === null
          ? null
          : () => {
              callback();
            };
    },
    get onpause(): RecorderLike['onpause'] {
      return null;
    },
    set onpause(callback) {
      recorder.onpause =
        callback === null
          ? null
          : () => {
              callback();
            };
    },
    get onresume(): RecorderLike['onresume'] {
      return null;
    },
    set onresume(callback) {
      recorder.onresume =
        callback === null
          ? null
          : () => {
              callback();
            };
    },
    get onerror(): RecorderLike['onerror'] {
      return null;
    },
    set onerror(callback) {
      recorder.onerror =
        callback === null
          ? null
          : (event) => {
              callback(event);
            };
    },
    start: (timesliceMs) => {
      recorder.start(timesliceMs);
    },
    pause: () => {
      recorder.pause();
    },
    resume: () => {
      recorder.resume();
    },
    stop: () => {
      recorder.stop();
    },
  };
}

const controller = new RecorderController({
  now: () => performance.now(),
  isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
  // The system cursor is left out of the video. Cursor effects are drawn later from the input log.
  getDisplayMedia: async () =>
    adaptStream(
      await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' } as MediaTrackConstraints,
        audio: false,
      }),
    ),
  getUserMedia: async (constraints) =>
    adaptStream(await navigator.mediaDevices.getUserMedia(constraints)),
  createRecorder: (stream, options) => {
    const source = streams.get(stream);
    if (source === undefined) throw new Error('That stream was not opened by this page.');
    return adaptRecorder(new MediaRecorder(source, options));
  },
  sendEvent: (event) => {
    window.scrimRecorder.sendEvent(event);
  },
});

window.scrimRecorder.onCommand((command) => {
  void controller.handle(command);
});

// The preload receives the chunk ports from main and hands them to the page with this message.
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window) return;
  const data = event.data;
  if (typeof data !== 'object' || data === null) return;
  const { type, kinds } = data as { type?: unknown; kinds?: unknown };
  if (type !== PORTS_MESSAGE_TYPE || !Array.isArray(kinds)) return;
  const ports: Partial<Record<TrackKind, PortLike>> = {};
  kinds.forEach((kind: unknown, index) => {
    const port = event.ports[index];
    if (port !== undefined && (kind === 'screen' || kind === 'camera' || kind === 'mic')) {
      ports[kind] = port;
    }
  });
  controller.attachPorts(ports);
});

window.scrimRecorder.sendEvent({ type: 'loaded' });
