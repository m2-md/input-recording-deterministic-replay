import { hashState, hex } from "./hash";
import {
  formatInput,
  LEFT,
  NONE,
  RIGHT,
  THRUST,
  type InputBits,
} from "./input";
import {
  decodeRuns,
  Recorder,
  serialize,
  verifyRecording,
  type Recording,
} from "./recording";
import { render } from "./render";
import { mulberry32, type Rng } from "./rng";
import { TICK_RATE } from "./session";
import { createState, step, WORLD, type State } from "./sim";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
canvas.width = WORLD.w;
canvas.height = WORLD.h;
const ctx = canvas.getContext("2d")!;
const hud = document.querySelector<HTMLPreElement>("#hud")!;
const recordBtn = document.querySelector<HTMLButtonElement>("#record")!;
const replayBtn = document.querySelector<HTMLButtonElement>("#replay")!;

const DT = 1 / TICK_RATE;
const seed = 20260723;

let state: State = createState();
let rng: Rng = mulberry32(seed);
let recorder: Recorder | null = null;
let recording: Recording | null = null;
let playback: { inputs: InputBits[]; index: number } | null = null;
let status = "CANLI";
let held: InputBits = NONE;

function resetLive(): void {
  state = createState();
  rng = mulberry32(seed);
  playback = null;
}

function toggleRecording(): void {
  if (playback) return;
  if (recorder) {
    recording = recorder.finish(state);
    recorder = null;
    const check = verifyRecording(recording);
    status = check.ok
      ? `kayıt kapandı · ${recording.ticks} tick · doğrulandı`
      : `kayıt kapandı · AYRILMA @ tick ${check.divergedAt}`;
  } else {
    resetLive();
    recorder = new Recorder(seed, TICK_RATE, 30);
    status = "KAYIT";
  }
}

function startReplay(): void {
  if (!recording) {
    status = "önce R ile bir oturum kaydet";
    return;
  }
  recorder = null;
  rng = mulberry32(recording.seed);
  state = createState();
  playback = { inputs: decodeRuns(recording.runs), index: 0 };
  status = "REPLAY";
}

function stepOnce(): void {
  if (playback) {
    if (playback.index >= playback.inputs.length) {
      const ok = recording && hashState(state) === recording.finalHash;
      status = ok
        ? "REPLAY BİTTİ · hash eşleşti"
        : "REPLAY BİTTİ · hash TUTMADI";
      playback = null;
      return;
    }
    state = step(state, playback.inputs[playback.index++], DT, rng);
  } else {
    const input = held;
    state = step(state, input, DT, rng);
    recorder?.capture(input, state);
  }
}

const keymap: Record<string, number> = {
  ArrowUp: THRUST,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  w: THRUST,
  a: LEFT,
  d: RIGHT,
  " ": THRUST,
};

addEventListener("keydown", (e) => {
  const bit = keymap[e.key];
  if (bit !== undefined) {
    held |= bit;
    e.preventDefault();
    return;
  }
  if (e.key === "r" || e.key === "R") toggleRecording();
  if (e.key === "p" || e.key === "P") startReplay();
});

addEventListener("keyup", (e) => {
  const bit = keymap[e.key];
  if (bit !== undefined) held &= ~bit;
});

recordBtn.addEventListener("click", toggleRecording);
replayBtn.addEventListener("click", startReplay);

function hudText(): string {
  const bytes = recording ? serialize(recording).length : 0;
  const ticks = recorder ? recorder.length : (recording?.ticks ?? 0);
  const blocks = recorder ? recorder.runCount : (recording?.runs.length ?? 0);
  return [
    `mod          : ${status}`,
    `tohum        : ${seed}`,
    `tick         : ${state.tick}`,
    `hash         : 0x${hex(hashState(state))}`,
    `girdi        : ${formatInput(playback ? (playback.inputs[playback.index - 1] ?? NONE) : held)}`,
    `atlatma/çarpma: ${state.dodged} / ${state.hits}`,
    `kayıt        : ${ticks} tick · ${blocks} blok · ${bytes} B`,
    ``,
    `↑/W veya boşluk: itki · ←/→: yan · R: kayıt aç-kapa · P: replay`,
  ].join("\n");
}

let acc = 0;
let last = performance.now();

function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    acc -= DT;
    stepOnce();
  }
  render(ctx, state, playback !== null);
  recordBtn.textContent = recorder ? "Kaydı bitir (R)" : "Kaydet (R)";
  hud.textContent = hudText();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
