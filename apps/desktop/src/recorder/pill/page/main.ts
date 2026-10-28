import type { z } from 'zod';
import { formatPillTime } from '../format';
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
  timer: element('timer', HTMLSpanElement),
  toggle: element('toggle', HTMLButtonElement),
  pauseIcon: document.getElementById('icon-pause'),
  playIcon: document.getElementById('icon-play'),
  stop: element('stop', HTMLButtonElement),
  discard: element('discard', HTMLButtonElement),
  keep: element('keep', HTMLButtonElement),
  yes: element('yes', HTMLButtonElement),
};

let state: PillState = { phase: 'recording', elapsedMs: 0, busy: false };
/** When the last state arrived, so the timer can run between the engine's reports. */
let receivedAt = performance.now();
let asking = false;

function shownMs(): number {
  if (state.phase !== 'recording') return state.elapsedMs;
  return state.elapsedMs + (performance.now() - receivedAt);
}

function render(): void {
  const paused = state.phase === 'paused';
  const saving = state.phase === 'saving';
  dom.dot.classList.toggle('paused', paused || saving);
  dom.timer.textContent = formatPillTime(shownMs());
  const label = paused ? 'Resume' : 'Pause';
  dom.toggle.title = label;
  dom.toggle.setAttribute('aria-label', label);
  dom.pauseIcon?.toggleAttribute('hidden', paused);
  dom.playIcon?.toggleAttribute('hidden', !paused);
  for (const button of [dom.toggle, dom.stop, dom.discard, dom.keep, dom.yes]) {
    button.disabled = state.busy || saving;
  }
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
