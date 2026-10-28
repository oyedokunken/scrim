import { sizeLabel } from '../geometry';
import { RegionPicker, type PickerAction } from '../picker';
import type { z } from 'zod';
import type { RegionCommand, regionEventSchema } from '../protocol';

type RegionEvent = z.infer<typeof regionEventSchema>;

declare global {
  interface Window {
    /** Exposed by the region preload. */
    scrimRegion: {
      onCommand(callback: (command: RegionCommand) => void): void;
      send(event: RegionEvent): void;
    };
  }
}

// The whole page is one canvas, so no style is ever set from script.
const canvas = document.getElementById('overlay');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('The overlay canvas is missing.');
const context = canvas.getContext('2d');
if (context === null) throw new Error('The overlay canvas has no 2d context.');
const ctx = context;

const GREEN = '#004E52';
const BUTTER = '#FBF8F4';
const DIM = 'rgba(0, 0, 0, 0.45)';
const FONT = '600 14px system-ui, sans-serif';

let picker = new RegionPicker(
  { width: window.innerWidth, height: window.innerHeight },
  window.devicePixelRatio,
);

function pill(text: string, x: number, y: number): void {
  ctx.font = FONT;
  const width = ctx.measureText(text).width + 20;
  const height = 28;
  const left = Math.min(Math.max(8, x), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - height - 8);
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 14);
  ctx.fill();
  ctx.fillStyle = BUTTER;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 10, top + height / 2 + 1);
}

function draw(): void {
  const ratio = window.devicePixelRatio;
  const width = Math.round(window.innerWidth * ratio);
  const height = Math.round(window.innerHeight * ratio);
  if (canvas instanceof HTMLCanvasElement && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = DIM;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  const box = picker.box;
  if (box === undefined) {
    pill('Drag to choose what to record. Esc cancels.', window.innerWidth / 2 - 150, 24);
    return;
  }
  ctx.clearRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = BUTTER;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const pixels = picker.pixels;
  const label = pixels === undefined ? 'Too small' : sizeLabel(pixels.px);
  const above = box.y > 44;
  pill(label, box.x, above ? box.y - 36 : box.y + 8);
  if (!picker.isDragging && pixels !== undefined) {
    pill('Enter to record. Esc cancels.', box.x, box.y + box.height + 8);
  }
}

function perform(action: PickerAction): void {
  if (action === undefined) return;
  if (action.type === 'confirm') window.scrimRegion.send({ type: 'confirm', rect: action.rect });
  else window.scrimRegion.send({ type: action.type });
}

window.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  perform(picker.pointerDown({ x: event.clientX, y: event.clientY }));
  draw();
});
window.addEventListener('pointermove', (event) => {
  if (!picker.isDragging) return;
  picker.pointerMove({ x: event.clientX, y: event.clientY });
  draw();
});
window.addEventListener('pointerup', (event) => {
  picker.pointerUp({ x: event.clientX, y: event.clientY });
  draw();
});
window.addEventListener('keydown', (event) => {
  perform(picker.key(event.key));
});
window.addEventListener('resize', () => {
  picker = new RegionPicker(
    { width: window.innerWidth, height: window.innerHeight },
    window.devicePixelRatio,
  );
  draw();
});

// The only command is `clear`: another display started a box, so this one drops its own.
window.scrimRegion.onCommand(() => {
  picker.clear();
  draw();
});

draw();
window.scrimRegion.send({ type: 'ready' });
