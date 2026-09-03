import { describe, expect, it } from "vitest";
import { hashState } from "../src/hash";
import { ALL_BITS, THRUST, type InputBits } from "../src/input";
import {
  decodeRuns,
  encodeRuns,
  replay,
  replayWithTrail,
  runsLength,
  serialize,
  type Recording,
} from "../src/recording";
import { mulberry32, type Rng } from "../src/rng";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;

describe("recording → replay", () => {
  it("replay exactly reproduces final hash of live session", () => {
    const { recording, final } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(final));
    expect(recording.finalHash).toBe(hashState(final));
  });

  it("playing identical recording twice yields identical result", () => {
    const { recording } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(replay(recording)));
  });

  it("recording depends on seed: changing seed changes final hash", () => {
    const a = recordSession(SEED, panicPilot, 900).recording;
    const b: Recording = { ...a, seed: SEED + 1 };
    expect(hashState(replay(b))).not.toBe(a.finalHash);
  });

  it("replay does not mutate recording", () => {
    const { recording } = recordSession(SEED, panicPilot, 600);
    const before = serialize(recording);
    replayWithTrail(recording, { trailEvery: 1 });
    expect(serialize(recording)).toBe(before);
  });
});

describe("run-length encoding", () => {
  // Seeded input array: random, but identical across runs.
  const makeInputs = (rng: Rng, n: number): InputBits[] => {
    const out: InputBits[] = [];
    let current = 0;
    for (let i = 0; i < n; i++) {
      if (rng() < 0.12) current = Math.floor(rng() * (ALL_BITS + 1));
      out.push(current);
    }
    return out;
  };

  it("decode(encode(x)) === x", () => {
    const inputs = makeInputs(mulberry32(7), 5000);
    expect(decodeRuns(encodeRuns(inputs))).toEqual(inputs);
  });

  it("run count is smaller than input count and length is preserved", () => {
    const inputs = makeInputs(mulberry32(7), 5000);
    const runs = encodeRuns(inputs);
    expect(runsLength(runs)).toBe(inputs.length);
    expect(runs.length).toBeLessThan(inputs.length / 4);
  });

  it("completely unchanging input collapses into single run", () => {
    const runs = encodeRuns(new Array<InputBits>(600).fill(THRUST));
    expect(runs).toEqual([{ input: THRUST, count: 600 }]);
  });

  it("empty array yields empty run list", () => {
    expect(encodeRuns([])).toEqual([]);
    expect(decodeRuns([])).toEqual([]);
    expect(runsLength([])).toBe(0);
  });

  it("in real session run count is less than a quarter of tick count", () => {
    const { recording } = recordSession(SEED, panicPilot, 1800);
    expect(runsLength(recording.runs)).toBe(1800);
    expect(recording.runs.length).toBeLessThan(450);
  });
});
