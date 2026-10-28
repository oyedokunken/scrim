import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { classifyProbeError, probeMessage } from '../../src/renderer/src/shell/device-probe';
import { PermissionCheck } from '../../src/renderer/src/shell/permission-check';

describe('classifyProbeError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'missing'],
    ['NotReadableError', 'busy'],
    ['TypeError', 'error'],
    ['', 'error'],
  ])('%s is %s', (name, expected) => {
    expect(classifyProbeError(name)).toBe(expected);
  });
});

describe('probeMessage', () => {
  it('tells a person what to do for every result', () => {
    for (const kind of ['camera', 'mic'] as const) {
      for (const result of ['granted', 'denied', 'missing', 'busy', 'error'] as const) {
        expect(probeMessage(kind, result).length).toBeGreaterThan(10);
      }
    }
    expect(probeMessage('mic', 'denied')).toContain('Microphone');
    expect(probeMessage('camera', 'missing')).toContain('Plug one in');
  });
});

describe('PermissionCheck', () => {
  const html = renderToStaticMarkup(<PermissionCheck onDone={vi.fn()} />);

  it('offers a check for each device and says both are optional', () => {
    expect(html).toContain('Camera');
    expect(html).toContain('Microphone');
    expect(html.match(/>Check</g)).toHaveLength(2);
    expect(html).toContain('Optional');
  });

  it('always has a way on, whatever the checks say', () => {
    expect(html).toContain('>Continue<');
    const blocked = renderToStaticMarkup(
      <PermissionCheck onDone={vi.fn()} initial={{ camera: 'denied', mic: 'missing' }} />,
    );
    expect(blocked).toContain('>Continue<');
    expect(blocked).toContain('Windows is blocking the camera');
    expect(blocked).toContain('No microphone found');
    expect(blocked.match(/>Check again</g)).toHaveLength(2);
  });

  it('announces each result politely', () => {
    expect(html.match(/role="status"/g)).toHaveLength(2);
  });
});
