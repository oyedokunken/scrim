import type { z } from 'zod';
import { formatPillTime } from '../format';
import { actionForPress, mediaButtonView, NO_MEDIA } from '../media-view';
import type { PillState, pillActionSchema } from '../protocol';

type PillAction = z.infer<typeof pillActionSchema>;

declare global {
  interface Window {
    /** Exposed by the pill preload. */
    scrimPill: {
      onState(callback: (state: PillState) => void): void;
      send(action: PillAction): void;
    };
  }
}

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`The pill is missing #${id}.`);
  return found;
}

const dom = {
  main: element('main', HTMLDivElement),
  confirm: element('confirm', HTMLDivElement),
  dot: element('dot', HTMLSpanElement),
  rec: element('rec', HTMLSpanElement),
  timer: element('timer', HTMLSpanElement),
  toggle: element('toggle', HTMLButtonElement),
  pauseIcon: document.getElementById('icon-pause'),
  playIcon: document.getElementById('icon-play'),
  stop: element('stop', HTMLButtonElement),
  discard: element('discard', HTMLButtonElement),
  keep: element('keep', HTMLButtonElement),
  yes: element('yes', HTMLButtonElement),
  note: element('note', HTMLSpanElement),
  mic: element('mic', HTMLButtonElement),
  camera: element('camera', HTMLButtonElement),
  icons: {
    mic: { on: document.getElementById('icon-mic'), off: document.getElementById('icon-mic-off') },
    camera: {
      on: document.getElementById('icon-camera'),
      off: document.getElementById('icon-camera-off'),
    },
  },
};

const NOTE_MS = 4000;
let state: PillState = { phase: 'recording', elapsedMs: 0, busy: false, media: NO_MEDIA };
/** The message on show, and until when. A new error shows again, the same one does not. */
let noteText: string | undefined;
let noteUntil = 0;
let lastNoteKey = '';
/** When the last state arrived, so the timer can run between the engine's reports. */
let receivedAt = performance.now();
let asking = false;

function shownMs(): number {
  if (state.phase !== 'recording') return state.elapsedMs;
  return state.elapsedMs + (performance.now() - receivedAt);
}

function renderMedia(): void {
  const saving = state.phase === 'saving';
  const notes: string[] = [];
  for (const kind of ['mic', 'camera'] as const) {
    const view = mediaButtonView(kind, state.media[kind]);
    const button = dom[kind];
    button.title = view.title;
    button.setAttribute('aria-label', view.label);
    button.setAttribute('aria-pressed', String(view.pressed));
    button.disabled = view.disabled || saving;
    if (view.errored) button.setAttribute('data-error', '');
    else button.removeAttribute('data-error');
    dom.icons[kind].on?.toggleAttribute('hidden', view.off);
    dom.icons[kind].off?.toggleAttribute('hidden', !view.off);
    if (view.note !== undefined) notes.push(view.note);
  }
  const key = notes.join('|');
  if (key !== lastNoteKey) {
    lastNoteKey = key;
    if (key !== '') {
      noteText = notes[0];
      noteUntil = performance.now() + NOTE_MS;
    }
  }
  const showNote = noteText !== undefined && performance.now() < noteUntil && !asking;
  dom.note.hidden = !showNote;
  dom.note.textContent = showNote ? (noteText ?? '') : '';
  dom.timer.hidden = showNote;
}

function render(): void {
  const paused = state.phase === 'paused';
  const saving = state.phase === 'saving';
  dom.dot.classList.toggle('paused', paused || saving);
  dom.rec.classList.toggle('paused', paused || saving);
  dom.rec.textContent = saving ? 'SAVING' : paused ? 'PAUSED' : 'REC';
  dom.timer.textContent = formatPillTime(shownMs());
  const label = paused ? 'Resume' : 'Pause';
  dom.toggle.title = label;
  dom.toggle.setAttribute('aria-label', label);
  dom.pauseIcon?.toggleAttribute('hidden', paused);
  dom.playIcon?.toggleAttribute('hidden', !paused);
  for (const button of [dom.toggle, dom.stop, dom.discard, dom.keep, dom.yes]) {
    button.disabled = state.busy || saving;
  }
  renderMedia();
  dom.main.hidden = asking;
  dom.confirm.hidden = !asking;
}

function ask(value: boolean): void {
  asking = value;
  render();
  if (value) dom.keep.focus();
  else dom.discard.focus();
}

dom.toggle.addEventListener('click', () => {
  window.scrimPill.send({ type: state.phase === 'paused' ? 'resume' : 'pause' });
});
for (const kind of ['mic', 'camera'] as const) {
  dom[kind].addEventListener('click', () => {
    // The button asks for a named state. The one shown here may be a moment old, and a press on
    // a stale button is the same request again, which main treats as no change.
    const action = actionForPress(kind, state.media[kind]);
    if (action !== undefined) window.scrimPill.send(action);
  });
}
dom.stop.addEventListener('click', () => {
  window.scrimPill.send({ type: 'stop' });
});
dom.discard.addEventListener('click', () => {
  ask(true);
});
dom.keep.addEventListener('click', () => {
  ask(false);
});
dom.yes.addEventListener('click', () => {
  asking = false;
  window.scrimPill.send({ type: 'discard' });
  render();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && asking) {
    event.preventDefault();
    ask(false);
  }
});

window.scrimPill.onState((next) => {
  state = next;
  receivedAt = performance.now();
  render();
});
window.setInterval(render, 250);
render();
window.scrimPill.send({ type: 'ready' });
