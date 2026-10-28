import type { Frame } from '../input/types';
import {
  BACKGROUND_PRESETS,
  BUBBLE_DEFAULTS,
  DEFAULT_BACKGROUND_ID,
  LAYOUT_DEFAULTS,
  type BackgroundFill,
  type BubbleCorner,
  type BubbleShape,
  type BubbleSize,
} from './constants';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BackgroundSpec =
  | { kind: 'none' }
  | { kind: 'preset'; id: string }
  | { kind: 'fill'; fill: BackgroundFill }
  | { kind: 'image'; path: string };

export interface BackgroundStyle {
  spec: BackgroundSpec;
  /** Share of the shorter output side. */
  paddingShare?: number | undefined;
  radiusShare?: number | undefined;
}

type ResolvedBackground =
  { kind: 'none' } | { kind: 'fill'; fill: BackgroundFill } | { kind: 'image'; path: string };

export interface Layout {
  output: Frame;
  /** Where the recording is drawn, in output pixels. */
  content: Rect;
  /** Corner radius of the recording, in output pixels. */
  radius: number;
  shadow: { offsetY: number; blur: number; alpha: number } | null;
  background: ResolvedBackground;
}

function resolveBackground(spec: BackgroundSpec): ResolvedBackground {
  if (spec.kind === 'none') return { kind: 'none' };
  if (spec.kind === 'image') return { kind: 'image', path: spec.path };
  if (spec.kind === 'fill') return { kind: 'fill', fill: spec.fill };
  const preset =
    BACKGROUND_PRESETS.find((candidate) => candidate.id === spec.id) ??
    BACKGROUND_PRESETS.find((candidate) => candidate.id === DEFAULT_BACKGROUND_ID);
  return preset === undefined ? { kind: 'none' } : { kind: 'fill', fill: preset.fill };
}

/**
 * Where the recording sits inside the output. With no background the recording fills the output
 * with square corners and no shadow. Otherwise it is inset by the padding, fitted inside without
 * changing its shape, centered, and given rounded corners and a soft shadow. Rectangles only: no
 * drawing happens here.
 */
export function computeLayout(source: Frame, output: Frame, style: BackgroundStyle): Layout {
  const background = resolveBackground(style.spec);
  if (background.kind === 'none') {
    return {
      output,
      content: { x: 0, y: 0, width: output.width, height: output.height },
      radius: 0,
      shadow: null,
      background,
    };
  }
  const short = Math.min(output.width, output.height);
  const share = Math.min(
    LAYOUT_DEFAULTS.maxPaddingShare,
    Math.max(0, style.paddingShare ?? LAYOUT_DEFAULTS.paddingShare),
  );
  const padding = short * share;
  const room = { width: output.width - 2 * padding, height: output.height - 2 * padding };
  const scale = Math.min(room.width / source.width, room.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const content = {
    x: (output.width - width) / 2,
    y: (output.height - height) / 2,
    width,
    height,
  };
  const radiusShare = Math.max(0, style.radiusShare ?? LAYOUT_DEFAULTS.radiusShare);
  const shadow = LAYOUT_DEFAULTS.shadow;
  return {
    output,
    content,
    radius: Math.min(width, height) * radiusShare,
    shadow: {
      offsetY: short * shadow.offsetYShare,
      blur: short * shadow.blurShare,
      alpha: shadow.alpha,
    },
    background,
  };
}

export interface BubbleStyle {
  visible?: boolean | undefined;
  corner?: BubbleCorner | undefined;
  size?: BubbleSize | undefined;
  shape?: BubbleShape | undefined;
}

export interface BubbleLayout {
  rect: Rect;
  shape: BubbleShape;
  /** Corner radius in output pixels. Half the side for a circle. */
  radius: number;
}

/**
 * The camera bubble inside the content area. The bubble is square, the compositor crops the
 * camera picture to fill it. It snaps to a corner with a margin that scales with its size.
 */
export function computeBubble(content: Rect, style: BubbleStyle): BubbleLayout | null {
  if (style.visible === false) return null;
  const size = style.size ?? BUBBLE_DEFAULTS.size;
  const corner = style.corner ?? BUBBLE_DEFAULTS.corner;
  const shape = style.shape ?? BUBBLE_DEFAULTS.shape;
  const side = Math.min(content.width, content.height) * BUBBLE_DEFAULTS.sizeShare[size];
  const margin = side * BUBBLE_DEFAULTS.marginShare;
  const x = corner.endsWith('left')
    ? content.x + margin
    : content.x + content.width - margin - side;
  const y = corner.startsWith('top')
    ? content.y + margin
    : content.y + content.height - margin - side;
  return {
    rect: { x, y, width: side, height: side },
    shape,
    radius: shape === 'circle' ? side / 2 : side * BUBBLE_DEFAULTS.roundedShare,
  };
}
