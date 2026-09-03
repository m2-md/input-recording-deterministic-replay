import { describe, expect, it } from "vitest";
import type { InputBits } from "../src/input";
import { findDivergence, replayWithTrail } from "../src/recording";
import type { Rng } from "../src/rng";
import { recordSession } from "../src/session";
import { panicPilot, step, type State } from "../src/sim";

describe("hunting desync: same recording, two different builds", () => {
  // "new build": at tick 300, spawn timer drifts by one in a million.
  // Nothing visible on screen; hash detects it immediately.
  const driftedStep = (
    state: State,
    input: InputBits,
    dt: number,
    rng: Rng,
  ): State => {
    const next = step(state, input, dt, rng);
    if (state.tick === 300) next.spawnTimer += 1e-6;
    return next;
  };

  it("coarse trail detects divergence, fine trail pinpoints exact frame", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const coarse = replayWithTrail(recording, { stepFn: driftedStep });
    expect(findDivergence(recording.trail, coarse.trail)).toBe(330);

    const fineOld = replayWithTrail(recording, { trailEvery: 1 }).trail;
    const fineNew = replayWithTrail(recording, {
      trailEvery: 1,
      stepFn: driftedStep,
    }).trail;
    expect(findDivergence(fineOld, fineNew)).toBe(301);
  });
});
