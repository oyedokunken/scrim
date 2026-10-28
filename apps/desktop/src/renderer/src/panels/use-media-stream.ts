import { useEffect, useState } from 'react';

export type StreamState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'ready'; stream: MediaStream }
  | { status: 'failed' };

/**
 * A live camera or microphone stream for a preview, open only while `active` is true. The tracks
 * stop when it turns false and when the page that shows it goes away, so the device light goes out.
 */
export function useMediaStream(
  kind: 'video' | 'audio',
  deviceId: string | null,
  active: boolean,
): StreamState {
  const [state, setState] = useState<StreamState>({ status: 'off' });

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    const constraints: MediaStreamConstraints =
      kind === 'video'
        ? { video: deviceId === null ? true : { deviceId: { exact: deviceId } }, audio: false }
        : { audio: deviceId === null ? true : { deviceId: { exact: deviceId } }, video: false };
    void navigator.mediaDevices
      .getUserMedia(constraints)
      .then((opened) => {
        if (cancelled) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        setState({ status: 'ready', stream: opened });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' });
      });
    return () => {
      cancelled = true;
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, [kind, deviceId, active]);

  return active ? (state.status === 'off' ? { status: 'loading' } : state) : { status: 'off' };
}
