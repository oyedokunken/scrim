/** Size of the recorded frame in pixels. */
export interface Frame {
  width: number;
  height: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

/** The cursor moved. `t` is milliseconds on the recording clock, paused time excluded. */
export interface MoveEvent {
  type: 'move';
  t: number;
  x: number;
  y: number;
  /** The display the cursor was on, when known. */
  display?: string | undefined;
}

/** A mouse button was pressed at a point in frame pixels. */
export interface ClickEvent {
  type: 'click';
  t: number;
  x: number;
  y: number;
  button: MouseButton;
  display?: string | undefined;
}

/** A mouse button was released. */
export interface ReleaseEvent {
  type: 'release';
  t: number;
  x: number;
  y: number;
  button: MouseButton;
  display?: string | undefined;
}

/** The wheel turned. Positive `dy` scrolls down and positive `dx` scrolls right. */
export interface WheelEvent {
  type: 'wheel';
  t: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  display?: string | undefined;
}

/** There is no keyboard event, by design. Scrim never logs what is typed. */
export type InputEvent = MoveEvent | ClickEvent | ReleaseEvent | WheelEvent;

/** Everything the zoom planner needs to know about a recording. */
export interface InputLog {
  frame: Frame;
  events: readonly InputEvent[];
}
