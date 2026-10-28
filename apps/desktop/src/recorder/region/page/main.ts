import type { z } from 'zod';
import { sizeLabel, type Rect } from '../geometry';
import { RegionPicker } from '../picker';
import type {
  AreaKind,
  DeviceChoice,
  RegionCommand,
  WindowTile,
  regionEventSchema,
} from '../protocol';

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

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`The overlay is missing #${id}.`);
  return found;
}

const dom = {
  dim: element('dim', HTMLDivElement),
  frame: element('frame', HTMLDivElement),
  selection: element('selection', HTMLDivElement),
  size: element('size', HTMLSpanElement),
  windows: element('windows', HTMLDivElement),
  pill: element('pill', HTMLDivElement),
  hint: element('hint', HTMLParagraphElement),
  toolbar: element('toolbar', HTMLDivElement),
  camera: element('camera', HTMLButtonElement),
  cameraMenu: element('camera-menu', HTMLButtonElement),
  mic: element('mic', HTMLButtonElement),
  micMenu: element('mic-menu', HTMLButtonElement),
  level: element('level', HTMLElement),
  start: element('start', HTMLButtonElement),
  menu: element('menu', HTMLUListElement),
  count: element('count', HTMLDivElement),
  status: element('status', HTMLParagraphElement),
};

const AREA_LABEL: Record<AreaKind, string> = {
  region: 'Region',
  window: 'Window',
  display: 'Full screen',
};

let mode: 'record' | 'screenshot' = 'record';
let area: AreaKind = 'region';
let camera: DeviceChoice = { enabled: false };
let mic: DeviceChoice = { enabled: false };
let primary = false;
let counting = false;
let tiles: WindowTile[] = [];
let selectedWindow: string | undefined;
let picker = newPicker();

function newPicker(): RegionPicker {
  return new RegionPicker(
    { width: window.innerWidth, height: window.innerHeight },
    window.devicePixelRatio,
  );
}

function send(event: RegionEvent): void {
  window.scrimRegion.send(event);
}

function announce(text: string): void {
  dom.status.textContent = text;
}

/** Where a box or card sits is set from here, with plain CSS properties. */
function place(target: HTMLElement, left: number, top: number): void {
  target.style.left = `${String(Math.round(left))}px`;
  target.style.top = `${String(Math.round(top))}px`;
}

function boxStyle(target: HTMLElement, box: Rect): void {
  place(target, box.x, box.y);
  target.style.width = `${String(Math.round(box.width))}px`;
  target.style.height = `${String(Math.round(box.height))}px`;
}

// ---- Microphone level and device lists -------------------------------------------------------

let micStream: MediaStream | undefined;
let micTimer: number | undefined;

function stopMicLevel(): void {
  if (micTimer !== undefined) window.clearInterval(micTimer);
  micTimer = undefined;
  for (const track of micStream?.getTracks() ?? []) track.stop();
  micStream = undefined;
  dom.level.classList.remove('on');
}

/** Read again after an await, because the person may have turned the microphone off meanwhile. */
function micWanted(): boolean {
  return mic.enabled;
}

async function startMicLevel(): Promise<void> {
  stopMicLevel();
  // One overlay listens for the level, so the microphone is not opened once per display.
  if (!mic.enabled || !primary) return;
  try {
    const audio = mic.deviceId === undefined ? true : { deviceId: { exact: mic.deviceId } };
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    if (!micWanted()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    micStream = stream;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    micTimer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
      dom.level.classList.toggle('on', peak > 6);
    }, 100);
  } catch {
    // Windows privacy settings, or no microphone. The recording says so when it starts.
    mic = { enabled: false };
    announce('The microphone could not be opened.');
    render();
    reportDevices();
  }
}

interface Choice {
  id: string;
  label: string;
}

/** Each device once, with the generic "Default" and "Communications" entries and their prefixes removed. */
async function listDevices(kind: 'videoinput' | 'audioinput'): Promise<Choice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const seen = new Set<string>();
  const out: Choice[] = [];
  for (const device of devices) {
    if (
      device.kind !== kind ||
      device.deviceId === 'default' ||
      device.deviceId === 'communications'
    ) {
      continue;
    }
    const label = device.label.replace(/^(default|communications) - /i, '').trim();
    const name = label === '' ? (kind === 'videoinput' ? 'Camera' : 'Microphone') : label;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: device.deviceId, label: name });
  }
  return out;
}

function closeMenu(): void {
  dom.menu.hidden = true;
  dom.menu.replaceChildren();
}

async function openMenu(kind: 'camera' | 'mic'): Promise<void> {
  if (!dom.menu.hidden) {
    closeMenu();
    return;
  }
  const choices = await listDevices(kind === 'camera' ? 'videoinput' : 'audioinput');
  const current = kind === 'camera' ? camera : mic;
  dom.menu.replaceChildren();
  if (choices.length === 0) {
    const item = document.createElement('li');
    const note = document.createElement('button');
    note.type = 'button';
    note.disabled = true;
    note.textContent = kind === 'camera' ? 'No camera found' : 'No microphone found';
    item.append(note);
    dom.menu.append(item);
  }
  for (const choice of choices) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', String(choice.id === current.deviceId));
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      const next: DeviceChoice = { enabled: true, deviceId: choice.id };
      if (kind === 'camera') camera = next;
      else mic = next;
      closeMenu();
      render();
      reportDevices();
      if (kind === 'mic') void startMicLevel();
    });
    item.append(button);
    dom.menu.append(item);
  }
  dom.menu.classList.toggle('below', dom.toolbar.getBoundingClientRect().top < 220);
  dom.menu.hidden = false;
}

function reportDevices(): void {
  send({ type: 'devices', camera, mic });
}

// ---- Drawing ---------------------------------------------------------------------------------

function toolbarAnchor(): Rect | undefined {
  if (area === 'region') return picker.box;
  return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

function placeToolbar(): void {
  const anchor = toolbarAnchor();
  if (anchor === undefined) return;
  const size = dom.toolbar.getBoundingClientRect();
  const gap = 14;
  let top = anchor.y + anchor.height + gap;
  if (area !== 'region') top = window.innerHeight - size.height - 48;
  else if (top + size.height > window.innerHeight - 8) top = anchor.y - size.height - gap - 34;
  if (area === 'region' && top < 8) top = anchor.y + anchor.height - size.height - gap;
  const left = anchor.x + anchor.width / 2 - size.width / 2;
  place(
    dom.toolbar,
    Math.min(Math.max(8, left), window.innerWidth - size.width - 8),
    Math.min(Math.max(8, top), window.innerHeight - size.height - 8),
  );
}

function readyToConfirm(): boolean {
  if (area === 'region') return picker.pixels !== undefined && !picker.isDragging;
  if (area === 'window') return selectedWindow !== undefined;
  return true;
}

function hintText(): string {
  if (counting) return '';
  if (area === 'region') {
    return picker.box === undefined ? 'Drag to choose an area. Esc cancels.' : '';
  }
  if (area === 'window') return tiles.length === 0 ? '' : 'Pick a window. Esc cancels.';
  return mode === 'record' ? 'Press Enter to record this screen. Esc cancels.' : '';
}

function render(): void {
  const box = picker.box;
  const showBox = area === 'region' && box !== undefined && !counting;
  document.body.classList.toggle('has-box', showBox);
  dom.dim.hidden = counting;
  dom.frame.hidden = area !== 'display' || counting;
  dom.selection.hidden = !showBox;
  if (showBox) {
    boxStyle(dom.selection, box);
    const pixels = picker.pixels;
    dom.size.textContent = pixels === undefined ? 'Too small' : sizeLabel(pixels.px);
    dom.size.classList.toggle('below', box.y < 40);
  }

  dom.windows.hidden = area !== 'window' || counting;
  dom.pill.hidden = !primary || counting;
  for (const button of dom.pill.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset['area'] === area));
  }

  const hint = hintText();
  dom.hint.hidden = hint === '' || !primary;
  dom.hint.textContent = hint;

  dom.camera.setAttribute('aria-pressed', String(camera.enabled));
  dom.mic.setAttribute('aria-pressed', String(mic.enabled));
  const showToolbar = mode === 'record' && !counting && readyToConfirm();
  dom.toolbar.hidden = !showToolbar;
  if (showToolbar) placeToolbar();
  if (!showToolbar) closeMenu();
}

function showCount(n: number | null): void {
  counting = n !== null;
  stopMicLevel();
  if (n === null) {
    dom.count.hidden = true;
    render();
    return;
  }
  const anchor = area === 'region' ? (picker.box ?? undefined) : undefined;
  const centerX = anchor === undefined ? window.innerWidth / 2 : anchor.x + anchor.width / 2;
  const centerY = anchor === undefined ? window.innerHeight / 2 : anchor.y + anchor.height / 2;
  render();
  dom.count.textContent = String(n);
  dom.count.hidden = false;
  place(dom.count, centerX - 80, centerY - 80);
  announce(String(n));
}

function buildCards(): void {
  for (const image of dom.windows.querySelectorAll('img')) URL.revokeObjectURL(image.src);
  dom.windows.replaceChildren();
  if (tiles.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No windows to show.';
    dom.windows.append(empty);
    return;
  }
  for (const tile of tiles) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('aria-pressed', String(tile.id === selectedWindow));
    const picture = document.createElement('img');
    picture.alt = '';
    picture.draggable = false;
    picture.src = URL.createObjectURL(new Blob([tile.png.slice()], { type: 'image/png' }));
    const name = document.createElement('span');
    name.textContent = tile.name;
    card.append(picture, name);
    card.addEventListener('click', () => {
      selectedWindow = tile.id;
      if (mode === 'screenshot') send({ type: 'confirm-window', sourceId: tile.id });
      else buildCards();
      render();
    });
    dom.windows.append(card);
  }
}

function setArea(next: AreaKind, announceIt: boolean): void {
  area = next;
  picker.clear();
  selectedWindow = undefined;
  if (next === 'window') buildCards();
  if (announceIt) announce(AREA_LABEL[next]);
  render();
}

// ---- Confirming ------------------------------------------------------------------------------

function confirm(): void {
  // The countdown cannot be skipped. People need the time to get ready.
  if (counting) return;
  if (area === 'region') {
    const region = picker.pixels;
    if (region !== undefined) send({ type: 'confirm-region', rect: region.dip });
  } else if (area === 'window') {
    if (selectedWindow !== undefined) send({ type: 'confirm-window', sourceId: selectedWindow });
  } else {
    send({ type: 'confirm-display' });
  }
}

// ---- Input -----------------------------------------------------------------------------------

function onChrome(event: Event): boolean {
  return (
    event.target instanceof Element && event.target.closest('.pill, .toolbar, .windows') !== null
  );
}

window.addEventListener('pointerdown', (event) => {
  if (counting || onChrome(event) || area !== 'region') {
    if (!(event.target instanceof Element && event.target.closest('.menu, .toolbar') !== null)) {
      closeMenu();
    }
    return;
  }
  closeMenu();
  const action = picker.pointerDown({ x: event.clientX, y: event.clientY });
  if (action?.type === 'begin') send({ type: 'begin' });
  render();
});
window.addEventListener('pointermove', (event) => {
  if (!picker.isDragging) return;
  picker.pointerMove({ x: event.clientX, y: event.clientY });
  render();
});
window.addEventListener('pointerup', (event) => {
  if (!picker.isDragging) return;
  picker.pointerUp({ x: event.clientX, y: event.clientY });
  render();
  // A screenshot is taken the moment the box is released.
  if (mode === 'screenshot' && picker.pixels !== undefined) confirm();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!dom.menu.hidden) closeMenu();
    else send({ type: 'cancel' });
  } else if (event.key === 'Enter' && (counting || !(event.target instanceof HTMLButtonElement))) {
    // Enter does nothing during the countdown, and never presses a focused button then.
    event.preventDefault();
    confirm();
  }
});
window.addEventListener('resize', () => {
  picker = newPicker();
  render();
});

for (const button of dom.pill.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    const next = button.dataset['area'];
    if (next !== 'region' && next !== 'window' && next !== 'display') return;
    setArea(next, true);
    send({ type: 'area', area: next });
    // A screenshot of the whole screen is taken at once.
    if (next === 'display' && mode === 'screenshot') confirm();
  });
}

dom.camera.addEventListener('click', () => {
  camera = { ...camera, enabled: !camera.enabled };
  render();
  reportDevices();
});
dom.mic.addEventListener('click', () => {
  mic = { ...mic, enabled: !mic.enabled };
  render();
  reportDevices();
  void startMicLevel();
});
dom.cameraMenu.addEventListener('click', () => {
  void openMenu('camera');
});
dom.micMenu.addEventListener('click', () => {
  void openMenu('mic');
});
dom.start.addEventListener('click', confirm);

window.scrimRegion.onCommand((command) => {
  switch (command.type) {
    case 'init':
      mode = command.mode;
      area = command.area;
      camera = command.camera;
      mic = command.mic;
      primary = command.primary;
      if (area === 'window') buildCards();
      render();
      if (mic.enabled) void startMicLevel();
      return;
    case 'clear':
      picker.clear();
      render();
      return;
    case 'set-area':
      setArea(command.area, false);
      return;
    case 'set-devices':
      camera = command.camera;
      mic = command.mic;
      render();
      void startMicLevel();
      return;
    case 'windows':
      tiles = command.tiles;
      buildCards();
      render();
      return;
    case 'count':
      showCount(command.n);
      return;
  }
});

render();
send({ type: 'ready' });
