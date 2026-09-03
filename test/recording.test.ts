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

describe("kayıt → replay", () => {
  it("replay, canlı oturumun son hash'ini birebir geri getirir", () => {
    const { recording, final } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(final));
    expect(recording.finalHash).toBe(hashState(final));
  });

  it("aynı kayıt iki kez oynatılınca aynı sonucu verir", () => {
    const { recording } = recordSession(SEED, panicPilot, 900);
    expect(hashState(replay(recording))).toBe(hashState(replay(recording)));
  });

  it("kayıt tohuma bağlıdır: tohum değişince final hash değişir", () => {
    const a = recordSession(SEED, panicPilot, 900).recording;
    const b: Recording = { ...a, seed: SEED + 1 };
    expect(hashState(replay(b))).not.toBe(a.finalHash);
  });

  it("replay kaydı mutasyona uğratmaz", () => {
    const { recording } = recordSession(SEED, panicPilot, 600);
    const before = serialize(recording);
    replayWithTrail(recording, { trailEvery: 1 });
    expect(serialize(recording)).toBe(before);
  });
});

describe("run-length kodlama", () => {
  // Tohumlu girdi dizisi: rastgele ama her koşuda aynı.
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

  it("blok sayısı girdi sayısından küçüktür ve uzunluk korunur", () => {
    const inputs = makeInputs(mulberry32(7), 5000);
    const runs = encodeRuns(inputs);
    expect(runsLength(runs)).toBe(inputs.length);
    expect(runs.length).toBeLessThan(inputs.length / 4);
  });

  it("hiç değişmeyen girdi tek bloğa iner", () => {
    const runs = encodeRuns(new Array<InputBits>(600).fill(THRUST));
    expect(runs).toEqual([{ input: THRUST, count: 600 }]);
  });

  it("boş dizi boş blok listesi verir", () => {
    expect(encodeRuns([])).toEqual([]);
    expect(decodeRuns([])).toEqual([]);
    expect(runsLength([])).toBe(0);
  });

  it("gerçek oturumda run sayısı tick sayısının çeyreğinden az", () => {
    const { recording } = recordSession(SEED, panicPilot, 1800);
    expect(runsLength(recording.runs)).toBe(1800);
    expect(recording.runs.length).toBeLessThan(450);
  });
});
