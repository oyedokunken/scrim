import { VideoOff } from 'lucide-react';
import { useEffect, useRef, type PointerEvent } from 'react';
import type { BubbleCorner, CameraValue } from './camera-panel';
import { useMediaStream } from './use-media-stream';

export interface CameraPreviewProps {
  value: CameraValue;
  deviceId: string | null;
  /** Called when the bubble is dragged to another corner. */
  onCorner: (corner: BubbleCorner) => void;
  /** Where the preview sits. A frame in the editor keeps its own stream, so this one can be off. */
  active?: boolean;
}

/** The corner nearest to a point inside the frame, so a dropped bubble snaps. */
export function nearestCorner(x: number, y: number, width: number, height: number): BubbleCorner {
  const vertical = y < height / 2 ? 'top' : 'bottom';
  const horizontal = x < width / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

/** A mock recording with your live camera in the chosen bubble. Drag the bubble to move it. */
export function CameraPreview({ value, deviceId, onCorner, active = true }: CameraPreviewProps) {
  const stream = useMediaStream('video', deviceId, active && value.on);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream.status === 'ready' ? stream.stream : null;
  }, [stream]);

  const finish = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    dragging.current = false;
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    onCorner(
      nearestCorner(event.clientX - box.left, event.clientY - box.top, box.width, box.height),
    );
  };

  return (
    <div className="demo-stage">
      <div
        ref={frame}
        className="mock-frame"
        role="img"
        aria-label={
          value.on
            ? `Preview of the camera bubble, ${value.size} size, ${value.shape.replace('-', ' ')}, ${value.corner.replace('-', ' ')}`
            : 'Preview with the camera off'
        }
      >
        <div className="mock-window" aria-hidden="true">
          <div className="demo-bar" />
          <div className="demo-body">
            <span className="demo-line wide" />
            <span className="demo-line" />
            <span className="demo-button" />
          </div>
        </div>
        {value.on ? (
          <div
            className={`bubble bubble-${value.corner} bubble-${value.size} bubble-${value.shape}`}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerUp={finish}
          >
            {stream.status === 'ready' ? (
              <video ref={video} autoPlay muted playsInline className="bubble-video" />
            ) : (
              <span className="bubble-empty">
                <VideoOff size={24} strokeWidth={1.5} aria-hidden="true" />
                <span>{stream.status === 'failed' ? 'No camera' : 'Opening'}</span>
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
