import { hashState } from "./hash";
import type { InputBits } from "./input";
import { mulberry32, type Rng } from "./rng";
import { createState, step, type State } from "./sim";

/** Consecutive tick count of identical input. This constitutes the whole recording format. */
export interface InputRun {
  input: InputBits;
  count: number;
}

/** State fingerprint at a specific tick. */
export interface HashSample {
  tick: number;
  hash: number;
}

export interface Recording {
  version: 1;
  seed: number;
  tickRate: number; // tick/second
  ticks: number; // total tick count
  runs: InputRun[]; // run-length encoded input
  trailEvery: number; // sampling interval of the hash trail
  trail: HashSample[];
  finalHash: number;
}

/** Compresses per-tick input sequence into runs. Pure. */
export function encodeRuns(inputs: readonly InputBits[]): InputRun[] {
  const runs: InputRun[] = [];
  for (const input of inputs) {
    const last = runs[runs.length - 1];
    if (last && last.input === input) last.count += 1;
    else runs.push({ input, count: 1 });
  }
  return runs;
}

/** Exact inverse of encodeRuns. decode(encode(x)) === x. */
export function decodeRuns(runs: readonly InputRun[]): InputBits[] {
  const inputs: InputBits[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) inputs.push(run.input);
  }
  return inputs;
}

/** Total tick count without expanding runs. */
export function runsLength(runs: readonly InputRun[]): number {
  let n = 0;
  for (const run of runs) n += run.count;
  return n;
}

export class Recorder {
  private readonly runs: InputRun[] = [];
  private readonly trail: HashSample[] = [];
  private ticks = 0;

  constructor(
    readonly seed: number,
    readonly tickRate: number,
    readonly trailEvery = 30,
  ) {}

  /** Record one tick: input provided at that tick and state after tick. */
  capture(input: InputBits, after: State): void {
    const last = this.runs[this.runs.length - 1];
    if (last && last.input === input) last.count += 1;
    else this.runs.push({ input, count: 1 });
    this.ticks += 1;
    if (after.tick % this.trailEvery === 0) {
      this.trail.push({ tick: after.tick, hash: hashState(after) });
    }
  }

  get length(): number {
    return this.ticks;
  }

  get runCount(): number {
    return this.runs.length;
  }

  finish(final: State): Recording {
    return {
      version: 1,
      seed: this.seed,
      tickRate: this.tickRate,
      ticks: this.ticks,
      runs: this.runs.map((r) => ({ ...r })),
      trailEvery: this.trailEvery,
      trail: this.trail.map((s) => ({ ...s })),
      finalHash: hashState(final),
    };
  }
}

export interface ReplayResult {
  state: State;
  trail: HashSample[];
}

/** Anything carrying the same signature as step can be replayed. */
export type StepFn = (
  state: State,
  input: InputBits,
  dt: number,
  rng: Rng,
) => State;

export interface ReplayOptions {
  /** How often to sample state hash. 1 = every tick. */
  trailEvery?: number;
  /** Simulation step function to run replay with. Default: project's step. */
  stepFn?: StepFn;
}

/** Replays recording from start to finish and collects hash trail. */
export function replayWithTrail(
  rec: Recording,
  options: ReplayOptions = {},
): ReplayResult {
  const { trailEvery = rec.trailEvery, stepFn = step } = options;
  const inputs = decodeRuns(rec.runs);
  const dt = 1 / rec.tickRate;
  const rng = mulberry32(rec.seed);
  const trail: HashSample[] = [];
  let state = createState();
  for (const input of inputs) {
    state = stepFn(state, input, dt, rng);
    if (state.tick % trailEvery === 0) {
      trail.push({ tick: state.tick, hash: hashState(state) });
    }
  }
  return { state, trail };
}

/** Shortcut for callers only interested in final state. */
export function replay(rec: Recording): State {
  return replayWithTrail(rec).state;
}

/**
 * Compares two hash trails and returns the tick of the first sample where they diverge.
 * Null if identical. Resolution matches the trail's sampling interval.
 */
export function findDivergence(
  a: readonly HashSample[],
  b: readonly HashSample[],
): number | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i].tick !== b[i].tick) return Math.min(a[i].tick, b[i].tick);
    if (a[i].hash !== b[i].hash) return a[i].tick;
  }
  if (a.length !== b.length) return (a.length > n ? a : b)[n].tick;
  return null;
}

export interface VerifyResult {
  ok: boolean;
  divergedAt: number | null;
  finalHash: number;
  expectedHash: number;
}

/** Does the recording match its own hash trail? If not, where did it diverge? */
export function verifyRecording(rec: Recording): VerifyResult {
  const { state, trail } = replayWithTrail(rec);
  const divergedAt = findDivergence(rec.trail, trail);
  const finalHash = hashState(state);
  return {
    ok: divergedAt === null && finalHash === rec.finalHash,
    divergedAt,
    finalHash,
    expectedHash: rec.finalHash,
  };
}

export function serialize(rec: Recording): string {
  return JSON.stringify(rec);
}

export function parseRecording(json: string): Recording {
  const rec = JSON.parse(json) as Recording;
  if (rec.version !== 1)
    throw new Error(`unknown recording version: ${rec.version}`);
  if (runsLength(rec.runs) !== rec.ticks) {
    throw new Error(
      `corrupt recording: runs ${runsLength(rec.runs)} ticks, header specifies ${rec.ticks}`,
    );
  }
  return rec;
}
