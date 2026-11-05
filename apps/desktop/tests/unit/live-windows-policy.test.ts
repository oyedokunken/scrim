import { describe, expect, it } from 'vitest';
import { planLiveWindows, stopHint } from '../../src/main/recording/live-windows-policy';
import { PILL_SIZE, resolvePillPosition } from '../../src/main/recording/pill-position';

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const base = {
  workArea,
  cameraOn: false,
  stopAccelerator: 'CommandOrControl+Shift+S',
  trayAvailable: true,
};

describe('live windows where the system hides them from capture (Windows)', () => {
  it('changes nothing: the pill shows as it always did, the bubble stays, no notification', () => {
    for (const kind of ['display', 'region', 'window'] as const) {
      expect(
        planLiveWindows({
          ...base,
          hidesWindowsFromCapture: true,
          cameraOn: true,
          source: { kind },
        }),
      ).toEqual({ pill: 'default', hideBubble: false, notice: null });
    }
  });
});

describe('live windows where the system cannot hide them (Linux)', () => {
  const linux = { ...base, hidesWindowsFromCapture: false };

  it('hides the bubble for every recording', () => {
    expect(planLiveWindows({ ...linux, source: { kind: 'display' } }).hideBubble).toBe(true);
  });

  it('keeps the pill outside a region, in a free corner', () => {
    const plan = planLiveWindows({
      ...linux,
      source: { kind: 'region', rect: { x: 400, y: 200, width: 800, height: 500 } },
    });
    expect(plan.pill).toBe('outside-region');
    expect(plan.notice).toBeNull();
  });

  it('does not show the pill when the region leaves no corner free', () => {
    const plan = planLiveWindows({
      ...linux,
      source: { kind: 'region', rect: { x: 0, y: 0, width: 1900, height: 1030 } },
    });
    expect(plan.pill).toBe('none');
    expect(plan.notice?.body).toContain('Ctrl+Shift+S');
  });

  it('does not show the pill for a full screen recording and says how to stop', () => {
    const plan = planLiveWindows({ ...linux, source: { kind: 'display' } });
    expect(plan.pill).toBe('none');
    expect(plan.notice).toEqual({
      title: 'Scrim is recording',
      body: 'Press Ctrl+Shift+S or use the Scrim icon in the system tray to stop.',
    });
  });

  it('does not show the pill for a window, whose position is not known', () => {
    expect(planLiveWindows({ ...linux, source: { kind: 'window' } }).pill).toBe('none');
  });

  it('does not show the pill for a region whose box is not known', () => {
    expect(planLiveWindows({ ...linux, source: { kind: 'region' } }).pill).toBe('none');
  });

  it('says there is no tray when there is none, so the person is not sent to look for it', () => {
    const plan = planLiveWindows({
      ...linux,
      trayAvailable: false,
      source: { kind: 'display' },
    });
    expect(plan.notice?.body).toBe(
      'Press Ctrl+Shift+S to stop, or open Scrim and stop from there.',
    );
    expect(plan.notice?.body).not.toContain('tray');
  });

  it('tells the person the camera is recording and the bubble is in the video', () => {
    const plan = planLiveWindows({
      ...linux,
      cameraOn: true,
      source: { kind: 'region', rect: { x: 400, y: 200, width: 800, height: 500 } },
    });
    expect(plan.pill).toBe('outside-region');
    expect(plan.notice?.body).toBe('Your camera is recording. The bubble appears in the video.');
  });

  it('joins the stop hint and the camera hint in one notification', () => {
    const plan = planLiveWindows({ ...linux, cameraOn: true, source: { kind: 'display' } });
    expect(plan.notice?.body).toContain('Ctrl+Shift+S');
    expect(plan.notice?.body).toContain('The bubble appears in the video.');
  });

  it('uses the stop key the person chose', () => {
    expect(stopHint('Alt+F9', true)).toContain('Alt+F9');
  });
});

describe('the pill position on a system that cannot hide it', () => {
  const recorded = { x: 0, y: 700, width: 600, height: 300 };
  const saved = { x: 24, y: 900 };

  it('forgets a remembered spot that sits on the recorded box', () => {
    const spot = resolvePillPosition({
      saved,
      workArea,
      workAreas: [workArea],
      recorded,
      avoidRecorded: true,
    });
    const pill = { ...spot, ...PILL_SIZE };
    const overlap =
      pill.x < recorded.x + recorded.width &&
      recorded.x < pill.x + pill.width &&
      pill.y < recorded.y + recorded.height &&
      recorded.y < pill.y + pill.height;
    expect(overlap).toBe(false);
  });

  it('keeps the remembered spot by default, as on Windows', () => {
    expect(resolvePillPosition({ saved, workArea, workAreas: [workArea], recorded })).toEqual(
      saved,
    );
  });
});
