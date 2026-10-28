export type DeviceKind = 'camera' | 'mic';

/** What a check found. Not asked yet, and asking, are states of the screen, not of the device. */
export type ProbeResult = 'granted' | 'denied' | 'missing' | 'busy' | 'error';

/** Maps the error getUserMedia throws to a result a person can act on. */
export function classifyProbeError(name: string): ProbeResult {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'error';
  }
}

/** The plain sentence for each result, with what to do next. */
export function probeMessage(kind: DeviceKind, result: ProbeResult): string {
  const thing = kind === 'camera' ? 'camera' : 'microphone';
  switch (result) {
    case 'granted':
      return `Your ${thing} works.`;
    case 'denied':
      return `Windows is blocking the ${thing}. Open Settings, Privacy and security, ${kind === 'camera' ? 'Camera' : 'Microphone'}, and let desktop apps use it.`;
    case 'missing':
      return `No ${thing} found. Plug one in, then check again.`;
    case 'busy':
      return `Another app is using the ${thing}. Close it, then check again.`;
    case 'error':
      return `Scrim could not check the ${thing}. You can still record without it.`;
  }
}

/**
 * Asks for the device once and lets go of it at once, so the light goes out. Only the answer is kept:
 * nothing is recorded and nothing leaves the page.
 */
export async function probeDevice(kind: DeviceKind): Promise<ProbeResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === 'camera' ? { video: true } : { audio: true },
    );
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error) {
    return classifyProbeError(error instanceof DOMException ? error.name : 'unknown');
  }
}
