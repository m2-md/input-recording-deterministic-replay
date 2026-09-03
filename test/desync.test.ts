import { describe, expect, it } from "vitest";
import type { InputBits } from "../src/input";
import { findDivergence, replayWithTrail } from "../src/recording";
import type { Rng } from "../src/rng";
import { recordSession } from "../src/session";
import { panicPilot, step, type State } from "../src/sim";

describe("desync avı: aynı kayıt, iki farklı build", () => {
  // "Yeni build": 300. tick'te spawn sayacına milyonda bir kayma giriyor.
  // Ekranda hiçbir şey görünmez; hash anında görür.
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

  it("kaba iz ayrılmayı bulur, ince iz tam kareyi verir", () => {
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
