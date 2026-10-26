import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

vi.mock('electron', () => ({
  session: {},
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

const { hardenWebContents } = await import('../../src/main/harden');
const { openExternalChecked } = await import('../../src/main/external-opener');

type OpenHandler = (details: { url: string }) => { action: 'deny' | 'allow' };

class FakeContents extends EventEmitter {
  openHandler: OpenHandler | undefined;
  setWindowOpenHandler(handler: OpenHandler): void {
    this.openHandler = handler;
  }
}

function harden(open = vi.fn(() => Promise.resolve(true))) {
  const contents = new FakeContents();
  hardenWebContents(contents as unknown as WebContents, 'app://scrim', open);
  return { contents, open };
}

function fire(contents: FakeContents, event: string, url?: string): boolean {
  let prevented = false;
  contents.emit(
    event,
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    url,
  );
  return prevented;
}

describe('hardenWebContents', () => {
  it.each(['will-navigate', 'will-redirect'])('%s blocks other origins and keeps ours', (event) => {
    const { contents } = harden();
    expect(fire(contents, event, 'https://example.com/')).toBe(true);
    expect(fire(contents, event, 'file:///C:/Windows/win.ini')).toBe(true);
    expect(fire(contents, event, 'app://other/index.html')).toBe(true);
    expect(fire(contents, event, 'app://scrim/index.html')).toBe(false);
  });

  it('never lets a webview attach', () => {
    const { contents } = harden();
    expect(fire(contents, 'will-attach-webview')).toBe(true);
  });

  it('denies every new window and hands the url to the opener', () => {
    const { contents, open } = harden();
    expect(contents.openHandler?.({ url: 'https://example.com/' })).toEqual({ action: 'deny' });
    expect(open).toHaveBeenCalledWith('https://example.com/');
  });
});

describe('openExternalChecked', () => {
  it('opens only allowed urls, through the given opener', async () => {
    const open = vi.fn(() => Promise.resolve());
    expect(await openExternalChecked('https://github.com/oyedokunken/scrim', open)).toBe(true);
    expect(await openExternalChecked('https://example.com/', open)).toBe(false);
    expect(await openExternalChecked('https://github.com:8443/oyedokunken/scrim', open)).toBe(
      false,
    );
    expect(open).toHaveBeenCalledTimes(1);
  });
});
