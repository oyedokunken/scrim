import type { BubbleCommand } from '../protocol';

declare global {
  interface Window {
    /** Exposed by the bubble preload. */
    scrimBubble: {
      onCommand(callback: (command: BubbleCommand) => void): void;
      send(event: { type: 'ready' }): void;
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
  try {
    const camera = await navigator.mediaDevices.getUserMedia({
      video:
        command.cameraDeviceId === undefined
          ? true
          : { deviceId: { exact: command.cameraDeviceId } },
    });
    video.srcObject = camera;
  } catch {
    // No camera to show. The round picture stays plain, and the recording reports the problem.
  }
  if (command.mic.enabled) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio:
          command.mic.deviceId === undefined ? true : { deviceId: { exact: command.mic.deviceId } },
      });
      startMicDot(mic);
    } catch {
      // No microphone to follow. The dot stays small and dim.
    }
  }
}

window.scrimBubble.onCommand((command) => {
  if (command.type === 'init') void init(command);
  else setSide(command.side);
});
window.addEventListener('pagehide', () => {
  void micContext?.close();
});
window.scrimBubble.send({ type: 'ready' });
