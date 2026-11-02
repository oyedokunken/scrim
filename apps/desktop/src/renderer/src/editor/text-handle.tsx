import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { TextItem } from '@scrim/core/render';
import { layoutOn, measuringContext } from './draw-text';

export interface TextHandleProps {
  item: TextItem;
  /** The finished frame size the canvas shows. */
  output: { width: number; height: number };
  /** The preview canvas. The handle is laid over the picture inside it. */
  canvas: HTMLCanvasElement | null;
  /** Reports a new center as fractions of the frame. `final` is true when the move is finished. */
  onMove: (x: number, y: number, final: boolean) => void;
}

interface Picture {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the picture sits inside the canvas box, which letterboxes it when the box is too tall. */
export function pictureRect(
  box: { left: number; top: number; width: number; height: number },
  output: { width: number; height: number },
): Picture {
  const fit = Math.min(box.width / output.width, box.height / output.height);
  const width = output.width * fit;
  const height = output.height * fit;
  return {
    left: box.left + (box.width - width) / 2,
    top: box.top + (box.height - height) / 2,
    width,
    height,
  };
}

/** The frame fractions for a pointer at a given distance from the picture's top left corner. */
export function fractionsFor(
  dx: number,
  dy: number,
  picture: { width: number; height: number },
): { x: number; y: number } {
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return {
    x: picture.width > 0 ? clamp(dx / picture.width) : 0.5,
    y: picture.height > 0 ? clamp(dy / picture.height) : 0.5,
  };
}

/**
 * A dashed box over the selected text on the preview. Drag it to move the text, or focus it and
 * press the arrow keys (Shift for bigger steps).
 */
export function TextHandle({ item, output, canvas, onMove }: TextHandleProps) {
  const [picture, setPicture] = useState<Picture | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useLayoutEffect(() => {
    if (canvas === null) return undefined;
    const measure = (): void => {
      setPicture(
        pictureRect(
          {
            left: canvas.offsetLeft,
            top: canvas.offsetTop,
            width: canvas.clientWidth,
            height: canvas.clientHeight,
          },
          output,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
    };
  }, [canvas, output]);

  const ctx = measuringContext();
  if (picture === null || ctx === null) return null;
  const layout = layoutOn(ctx, item, output);
  const k = picture.width / output.width;

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    const centerX = picture.left + item.x * picture.width;
    const centerY = picture.top + item.y * picture.height;
    const stage = event.currentTarget.offsetParent?.getBoundingClientRect();
    const originX = stage?.left ?? 0;
    const originY = stage?.top ?? 0;
    drag.current = { dx: event.clientX - originX - centerX, dy: event.clientY - originY - centerY };
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>, final: boolean): void => {
    const start = drag.current;
    if (start === null) return;
    const stage = event.currentTarget.offsetParent?.getBoundingClientRect();
    const px = event.clientX - (stage?.left ?? 0) - start.dx - picture.left;
    const py = event.clientY - (stage?.top ?? 0) - start.dy - picture.top;
    const next = fractionsFor(px, py, picture);
    onMove(next.x, next.y, final);
    if (final) drag.current = null;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const change = delta[event.key];
    if (change === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onMove(
      Math.min(1, Math.max(0, item.x + change[0])),
      Math.min(1, Math.max(0, item.y + change[1])),
      true,
    );
  };

  return (
    <button
      type="button"
      className="text-handle"
      data-testid="text-handle"
      aria-label={`Move the text ${item.text}. Drag it or use the arrow keys.`}
      style={{
        left: picture.left + (layout.box.x + layout.box.width / 2) * k,
        top: picture.top + (layout.box.y + layout.box.height / 2) * k,
        width: layout.box.width * k,
        height: layout.box.height * k,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        move(event, false);
      }}
      onPointerUp={(event) => {
        move(event, true);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={onKeyDown}
    />
  );
}
