/** Size of the recorded frame in pixels. */
export interface Frame {
  width: number;
  height: number;
}

/** The cursor moved. `t` is milliseconds on the recording clock, paused time excluded. */
export interface MoveEvent {
  type: 'move';
  t: number;
  x: number;
  y: number;
}

/** A mouse button was pressed at a point in frame pixels. */
export interface ClickEvent {
  type: 'click';
  t: number;
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
}

export type InputEvent = MoveEvent | ClickEvent;

/** Everything the zoom planner needs to know about a recording. */
export interface InputLog {
  frame: Frame;
  events: readonly InputEvent[];
}
