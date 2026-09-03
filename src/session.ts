import { Recorder, type Recording } from "./recording";
import { mulberry32 } from "./rng";
import { createState, step, type Pilot, type State } from "./sim";

export const TICK_RATE = 60;

export interface Session {
  recording: Recording;
  final: State;
}

export function recordSession(
  seed: number,
  pilot: Pilot,
  ticks: number,
  trailEvery = 30,
): Session {
  const rng = mulberry32(seed);
  const recorder = new Recorder(seed, TICK_RATE, trailEvery);
  const dt = 1 / TICK_RATE;
  let state = createState();
  for (let i = 0; i < ticks; i++) {
    const input = pilot(state);
    state = step(state, input, dt, rng);
    recorder.capture(input, state);
  }
  return { recording: recorder.finish(state), final: state };
}
