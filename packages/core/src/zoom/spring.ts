/**
 * A critically damped spring: it reaches its target without overshoot and starts and ends with
 * zero acceleration, which is what makes a camera move look smooth. The step is exact for a
 * target that holds still during it, so the result does not depend on the step size by much.
 */
interface SpringState {
  x: number;
  v: number;
}

/**
 * Natural frequency, in 1 per second, of each of the two springs in a chain that together reach
 * 95 percent of the way in `easeMs`. A chain of two critically damped springs has no jump in
 * acceleration when the target changes, which a single spring does, and that jump is what the eye
 * reads as a corner.
 */
export function omegaFor(easeMs: number): number {
  return 7.754 / (easeMs / 1000);
}

function stepSpring(state: SpringState, target: number, omega: number, dtSec: number): void {
  const d = state.x - target;
  const decay = Math.exp(-omega * dtSec);
  const k = state.v + omega * d;
  state.x = target + (d + k * dtSec) * decay;
  state.v = (state.v - omega * k * dtSec) * decay;
}

/** Two springs in a row: the first chases the target, the second chases the first. */
export interface SpringChain {
  lead: SpringState;
  out: SpringState;
}

export function chain(at: number): SpringChain {
  return { lead: { x: at, v: 0 }, out: { x: at, v: 0 } };
}

export function stepChain(state: SpringChain, target: number, omega: number, dtSec: number): void {
  stepSpring(state.lead, target, omega, dtSec);
  stepSpring(state.out, state.lead.x, omega, dtSec);
}
