import type { BubbleCommand, BubbleEvent } from '../protocol';

declare global {
  interface Window {
    /** Exposed by the bubble preload. */
    scrimBubble: {
      onCommand(callback: (command: BubbleCommand) => void): void;
      send(event: BubbleEvent): void;
    };
  }
}

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`The bubble is missing #${id}.`);
  return found;
}

const stage = element('stage', HTMLDivElement);
const video = element('video', HTMLVideoElement);
const dot = element('dot', HTMLDivElement);
const bubble = element('bubble', HTMLDivElement);

let micContext: AudioContext | undefined;
let cameraStream: MediaStream | undefined;
let micStream: MediaStream | undefined;
let cameraDeviceId: string | undefined;
/** What the pill last said, so a stream that opens late still starts in the right state. */
let media = { micMuted: false, cameraOn: true };
/** True once `init` has tried to open the camera and the microphone. */
let opened = false;

function reasonOf(
  error: unknown,
): 'device-busy' | 'device-removed' | 'permission-denied' | 'unknown' {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission-denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'device-removed';
  if (name === 'NotReadableError' || name === 'AbortError') return 'device-busy';
  return 'unknown';
}

async function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: cameraDeviceId === undefined ? true : { deviceId: { exact: cameraDeviceId } },
  });
}

/**
 * Applies the pill's buttons. A camera that is off has its track switched off and the picture
 * paused, so no frames are painted. Switching it back on reopens the camera when the track was
 * lost in the meantime, and says so when that fails, so main can put the button back.
 */
async function applyMedia(next: { micMuted: boolean; cameraOn: boolean }): Promise<void> {
  media = next;
  // The devices are still opening. `init` applies what was asked once they are open, and opening
  // the camera a second time now would race the first.
  if (!opened) return;
  for (const track of micStream?.getAudioTracks() ?? []) track.enabled = !next.micMuted;
  const track = cameraStream?.getVideoTracks()[0];
  if (!next.cameraOn) {
    if (track !== undefined) track.enabled = false;
    video.pause();
    return;
  }
  try {
    if (track === undefined || track.readyState === 'ended') {
      for (const old of cameraStream?.getTracks() ?? []) old.stop();
      cameraStream = await openCamera();
      video.srcObject = cameraStream;
    } else {
      track.enabled = true;
    }
    if (media.cameraOn) await video.play();
  } catch (error) {
    window.scrimBubble.send({ type: 'camera-failed', reason: reasonOf(error) });
  }
}

function setSide(side: 'left' | 'right'): void {
  stage.classList.toggle('left', side === 'left');
}

/** The dot's size and brightness follow the loudness, smoothed so it does not flicker. */
function startMicDot(stream: MediaStream): void {
  const context = new AudioContext();
  micContext = context;
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let level = 0;
  const tick = (): void => {
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const loudness = Math.min(1, Math.sqrt(sum / samples.length) * 4);
    level = level * 0.7 + loudness * 0.3;
    dot.style.transform = `scale(${String(0.5 + level * 0.7)})`;
    dot.style.opacity = String(0.45 + level * 0.55);
    requestAnimationFrame(tick);
  };
  tick();
}

async function init(command: Extract<BubbleCommand, { type: 'init' }>): Promise<void> {
  setSide(command.side);
  // Set through the style object, which a strict style policy allows, unlike a style attribute.
  if (command.size !== undefined) {
    bubble.style.width = `${String(command.size)}px`;
    bubble.style.height = `${String(command.size)}px`;
  }
  bubble.classList.toggle('square', command.shape === 'rounded-square');
  cameraDeviceId = command.cameraDeviceId;
  try {
    cameraStream = await openCamera();
    video.srcObject = cameraStream;
  } catch {
    // No camera to show. The round picture stays plain, and the recording reports the problem.
  }
  if (command.mic.enabled) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio:
          command.mic.deviceId === undefined ? true : { deviceId: { exact: command.mic.deviceId } },
      });
      micStream = mic;
      for (const track of mic.getAudioTracks()) track.enabled = !media.micMuted;
      startMicDot(mic);
    } catch {
      // No microphone to follow. The dot stays small and dim.
    }
  }
  opened = true;
  // A camera that was switched off while the devices opened is switched off now.
  if (!media.cameraOn) void applyMedia(media);
}

window.scrimBubble.onCommand((command) => {
  if (command.type === 'init') void init(command);
  else if (command.type === 'media') void applyMedia(command);
  else setSide(command.side);
});
window.addEventListener('pagehide', () => {
  void micContext?.close();
});
window.scrimBubble.send({ type: 'ready' });
