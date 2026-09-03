import { hex } from "../src/hash";
import { ALL_BITS, type InputBits } from "../src/input";
import {
  decodeRuns,
  encodeRuns,
  findDivergence,
  replay,
  replayWithTrail,
  serialize,
} from "../src/recording";
import { mulberry32, type Rng } from "../src/rng";
import { recordSession, TICK_RATE } from "../src/session";
import { createState, panicPilot, step, type State } from "../src/sim";

const SEED = 20260723;
const TICKS = 1800; // 30 saniye
const RUNS = 50;
const WARMUP = 20;

const { recording } = recordSession(SEED, panicPilot, TICKS, 30);

function measure(fn: () => void): number {
  for (let i = 0; i < WARMUP; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1]!;
}

const plain = measure(() => replay(recording));
const traced = measure(() => replayWithTrail(recording, { trailEvery: 1 }));

// --- Sıkıştırma: bot pilot vs insan benzeri girdi -------------------------
const rawBytes = (n: number) => n * 4; // tick başına 4 bayt ham girdi
const runBytes = (n: number) => n * 4; // blok başına {input:u8, count:u24}

/** Tuşları 6–45 tick basılı tutan, insana benzer girdi akışı. */
function humanInputs(rng: Rng, ticks: number): InputBits[] {
  const out: InputBits[] = [];
  while (out.length < ticks) {
    const bits = Math.floor(rng() * (ALL_BITS + 1));
    const hold = 6 + Math.floor(rng() * 40);
    for (let i = 0; i < hold && out.length < ticks; i++) out.push(bits);
  }
  return out;
}

const botRuns = recording.runs.length;
const human = humanInputs(mulberry32(99), 3600);
const humanRuns = encodeRuns(human).length;

// --- Desync: hash ne zaman görür, göz ne zaman görür? ---------------------
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

const fineOld = replayWithTrail(recording, { trailEvery: 1 }).trail;
const fineNew = replayWithTrail(recording, {
  trailEvery: 1,
  stepFn: driftedStep,
}).trail;
const hashTick = findDivergence(fineOld, fineNew);
const coarseTick = findDivergence(
  recording.trail,
  replayWithTrail(recording, { stepFn: driftedStep }).trail,
);

/** Ekrana yansıyan ilk fark: 1 px'den fazla kayma ya da sayaç/kaya değişimi. */
function firstVisibleDivergence(): number | null {
  const inputs = decodeRuns(recording.runs);
  const dt = 1 / recording.tickRate;
  const rngA = mulberry32(recording.seed);
  const rngB = mulberry32(recording.seed);
  let a = createState();
  let b = createState();
  for (const input of inputs) {
    a = step(a, input, dt, rngA);
    b = driftedStep(b, input, dt, rngB);
    if (
      Math.abs(a.ship.x - b.ship.x) > 1 ||
      Math.abs(a.ship.y - b.ship.y) > 1 ||
      a.rocks.length !== b.rocks.length ||
      a.dodged !== b.dodged ||
      a.hits !== b.hits
    ) {
      return a.tick;
    }
  }
  return null;
}

const visibleTick = firstVisibleDivergence();

const simSeconds = TICKS / TICK_RATE;
console.log("Kanyon — kayıt boyutu + replay hızı");
console.log(
  `sahne: tohum=${SEED} · ${TICKS} tick (${simSeconds.toFixed(1)} sn sim) · ${RUNS} koşu, ${WARMUP} ısınma\n`,
);

console.log("replay hızı");
console.log(
  `  replay (hashsiz)   : ${plain.toFixed(2)} ms · ${(TICKS / plain).toFixed(0)} kare/ms · gerçek zamanın ${Math.round(simSeconds / (plain / 1000)).toLocaleString("en-US")}x'i`,
);
console.log(
  `  replay + her tick hash: ${traced.toFixed(2)} ms · ${(TICKS / traced).toFixed(0)} kare/ms\n`,
);

console.log("kayıt boyutu");
console.log(
  `  bot pilot          : ${TICKS} tick → ${botRuns} blok · ${rawBytes(TICKS)} B ham → ${runBytes(botRuns)} B run (${(rawBytes(TICKS) / runBytes(botRuns)).toFixed(1)}x)`,
);
console.log(
  `  insan benzeri girdi: ${human.length} tick → ${humanRuns} blok · ${rawBytes(human.length)} B ham → ${runBytes(humanRuns)} B run (${(rawBytes(human.length) / runBytes(humanRuns)).toFixed(1)}x)`,
);
console.log(`  JSON kayıt dosyası : ${serialize(recording).length} B\n`);

console.log("desync görünürlüğü (spawnTimer += 1e-6 @ tick 300)");
console.log(`  kaba iz (30 tick)  : tick ${coarseTick}`);
console.log(`  ince iz (1 tick)   : tick ${hashTick}`);
console.log(`  gözle görülür fark : tick ${visibleTick}`);
console.log(
  `  hash'in avantajı   : ${(visibleTick ?? 0) - (hashTick ?? 0)} tick (${(((visibleTick ?? 0) - (hashTick ?? 0)) / TICK_RATE).toFixed(1)} sn)`,
);
console.log(`  final hash         : 0x${hex(recording.finalHash)}`);
