import { describe, expect, it, vi } from 'vitest';

const ses = {
  setPermissionRequestHandler: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setSpellCheckerEnabled: vi.fn(),
  setSpellCheckerLanguages: vi.fn(),
  setSpellCheckerDictionaryDownloadURL: vi.fn(),
};

vi.mock('electron', () => ({
  session: { defaultSession: ses },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}));

const { hardenSession } = await import('../../src/main/harden');

describe('hardenSession and the spelling dictionary', () => {
  it('leaves Chromium nothing to download from the network', () => {
    hardenSession({ appOrigin: 'app://scrim', devCsp: undefined });
    expect(ses.setSpellCheckerLanguages).toHaveBeenCalledWith([]);
    expect(ses.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
    expect(ses.setSpellCheckerDictionaryDownloadURL).toHaveBeenCalledWith(
      'app://scrim/dictionaries/',
    );
  });
});
