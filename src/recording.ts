import { hashState } from "./hash";
import type { InputBits } from "./input";
import { mulberry32, type Rng } from "./rng";
import { createState, step, type State } from "./sim";

/** Aynı girdinin arka arkaya kaç tick sürdüğü. Kayıt formatının tamamı bu. */
export interface InputRun {
  input: InputBits;
  count: number;
}

/** Belirli bir tick'teki durum parmak izi. */
export interface HashSample {
  tick: number;
  hash: number;
}

export interface Recording {
  version: 1;
  seed: number;
  tickRate: number; // tick/saniye
  ticks: number; // toplam tick sayısı
  runs: InputRun[]; // run-length kodlanmış girdi
  trailEvery: number; // hash izinin örnekleme aralığı
  trail: HashSample[];
  finalHash: number;
}

/** Tick başına girdi dizisini tekrar bloklarına indirger. Saf. */
export function encodeRuns(inputs: readonly InputBits[]): InputRun[] {
  const runs: InputRun[] = [];
  for (const input of inputs) {
    const last = runs[runs.length - 1];
    if (last && last.input === input) last.count += 1;
    else runs.push({ input, count: 1 });
  }
  return runs;
}

/** encodeRuns'ın tam tersi. decode(encode(x)) === x. */
export function decodeRuns(runs: readonly InputRun[]): InputBits[] {
  const inputs: InputBits[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.count; i++) inputs.push(run.input);
  }
  return inputs;
}

/** Blokları açmadan toplam tick sayısı. */
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

  /** Bir tick'i kaydet: o tick'e verilen girdi ve tick sonrası durum. */
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

/** `step` ile aynı imzayı taşıyan her şey replay edilebilir. */
export type StepFn = (
  state: State,
  input: InputBits,
  dt: number,
  rng: Rng,
) => State;

export interface ReplayOptions {
  /** Kaç tick'te bir hash örneği alınsın. 1 = her tick. */
  trailEvery?: number;
  /** Hangi simülasyonla oynatılsın. Varsayılan: projenin `step`'i. */
  stepFn?: StepFn;
}

/** Kaydı baştan sona yeniden oynatır ve hash izini toplar. */
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

/** Sadece son durumu isteyenler için kısayol. */
export function replay(rec: Recording): State {
  return replayWithTrail(rec).state;
}

/**
 * İki hash izini karşılaştırır, ilk ayrıldıkları örneğin tick'ini döndürür.
 * Aynıysa null. Çözünürlük, izin örnekleme aralığı kadardır.
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

/** Kayıt kendi hash izini tutuyor mu? Tutmuyorsa nerede koptu? */
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
    throw new Error(`bilinmeyen kayıt sürümü: ${rec.version}`);
  if (runsLength(rec.runs) !== rec.ticks) {
    throw new Error(
      `bozuk kayıt: runs ${runsLength(rec.runs)} tick, başlıkta ${rec.ticks}`,
    );
  }
  return rec;
}
