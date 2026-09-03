# Canyon — Input Recording and Deterministic Replay (Black Box)

Working code for the article "Black Box: Turning the 'It Happens Sometimes' Bug Into a
Test With Input Recording and Deterministic Replay". A small but complete canvas game
(**Canyon**), a recording format that is nothing but a seed plus per-frame input, and
21 tests.

The idea in one sentence: if the simulation is deterministic, there is no need to record
state. If you store the seed and the input per tick, you can bring back the entire session
by re-running `step` from the beginning. Thirty seconds of gameplay comes down to an 11 KB
JSON file and a 0.39 ms regression test.

## Contents

- `src/sim.ts` — the single source of truth for the game: `State`, `createState`, the pure
  `step(state, input, dt, rng)`, and the test pilot `panicPilot`. No DOM, no `Math.random`,
  no `Date`.
- `src/input.ts` — input is a single integer: the `THRUST | LEFT | RIGHT` bitmask. This is
  where the cheapness of the recording format comes from.
- `src/rng.ts` — `mulberry32(seed)`: seeded PRNG.
- `src/hash.ts` — `hashState`: FNV-1a reducing the whole state to a single 32-bit number
  (the `-0` trap closed).
- `src/recording.ts` — the recording format and its tools: `encodeRuns`/`decodeRuns` (RLE),
  `Recorder`, `replayWithTrail` (with an injectable `stepFn`), `findDivergence`,
  `verifyRecording`, `serialize`/`parseRecording`.
- `src/session.ts` — `recordSession(seed, pilot, ticks, trailEvery)`: headless session recording.
- `src/render.ts` — it ONLY draws; it swaps the palette in replay mode.
- `src/main.ts` + `index.html` — the browser face: keyboard → `InputBits`, fixed-timestep loop,
  `R`/Record and `P`/Replay buttons, seed · tick · hash · recording size in the HUD.
- `scripts/make-fixture.ts` — generates the fixture and prints statistics.
- `scripts/bench.ts` — measures recording size (raw vs RLE) and replay speed.
- `test/` — 21 tests: record→replay, RLE round-trip, corrupt recording, `findDivergence`,
  desync hunting, and the regression test for the fixture on disk.

## Setup

```bash
npm install
```

## Running

### Demo

```bash
npm run dev
```

`http://localhost:5173/` → start recording with **Record (R)** (the game restarts), fly
around, finish with **Record (R)** again, and play it back with **Replay (P)**. When the
replay ends, the HUD should read `REPLAY FINISHED · hash matched`.

Keys: `↑`/`W`/space thrust, `←`/`→` lateral thrust, `R` toggle recording, `P` replay.

> Do not open it over `file://`; the modules will not load and the screen stays blank.
> Vite is required.

### Tests

```bash
npm test
```

Expected output:

```
 ✓ test/divergence.test.ts (4 tests) 1ms
 ✓ test/traps.test.ts (1 test) 6ms
 ✓ test/regression.test.ts (2 tests) 11ms
 ✓ test/corruption.test.ts (4 tests) 16ms
 ✓ test/desync.test.ts (1 test) 17ms
 ✓ test/recording.test.ts (9 tests) 27ms

 Test Files  6 passed (6)
      Tests  21 passed (21)
```

The tests run in the `node` environment — NO `document`, NO canvas. Do not set
`environment: "jsdom"`; all of the tests rest on pure logic.

### Generating the fixture

```bash
npm run fixture
```

```
recording written: <repo>/test/fixtures/canyon-session.json
  seed         : 20260723
  tick         : 1800 (30 s)
  run blocks   : 417
  compression  : 7200 B raw → 1668 B run (4.3x)
  JSON size    : 11213 B
  hash samples : 60
  final hash   : 0x4aad1b72
  dodged       : 82 · hits: 4
```

The fixture is committed to the repo; `test/regression.test.ts` reads it and replays it. If
the output has changed, first look at where it diverged with `findDivergence` — do not blindly
refresh the hash.

### Bench — recording size + replay speed

```bash
npm run bench
```

Expected output (timings vary by machine; block/byte counts are fixed):

```
Canyon — recording size + replay speed
scene: seed=20260723 · 1800 ticks (30.0 s sim) · 50 runs, 20 warmup

replay speed
  replay (no hash)        : 0.39 ms · 4622 frames/ms · 77,030x real-time
  replay + hash per tick  : 4.24 ms · 424 frames/ms

recording size
  bot pilot               : 1800 ticks → 417 blocks · 7200 B raw → 1668 B run (4.3x)
  human-like input        : 3600 ticks → 123 blocks · 14400 B raw → 492 B run (29.3x)
  JSON recording file     : 11213 B

desync visibility (spawnTimer += 1e-6 @ tick 300)
  coarse trail (30 ticks) : tick 330
  fine trail (1 tick)     : tick 301
  visually noticeable     : tick 384
  hash advantage          : 83 ticks (1.4 s)
  final hash              : 0x4aad1b72
```

### Production build

```bash
npm run build   # tsc && vite build
npm run preview
```

## File layout

```
index.html
src/
  input.ts        # InputBits bitmask
  rng.ts          # mulberry32
  sim.ts          # State, createState, step, panicPilot
  hash.ts         # hashState (FNV-1a), hex
  recording.ts    # RLE + Recorder + replay + findDivergence + verify + parse
  session.ts      # recordSession (headless session)
  render.ts       # drawing only
  main.ts         # demo: keyboard, buttons, fixed-timestep loop, HUD
scripts/
  make-fixture.ts # generates test/fixtures/canyon-session.json
  bench.ts        # size + speed measurement
test/
  recording.test.ts   # record→replay + RLE (9)
  corruption.test.ts  # corrupt recording (4)
  divergence.test.ts  # findDivergence (4)
  desync.test.ts      # same recording, two different builds (1)
  traps.test.ts       # the Math.random trap (1)
  regression.test.ts  # the fixture on disk (2)
  fixtures/canyon-session.json
```

## Lessons learned (also covered in the article)

- A hash trail's resolution is only as fine as its sampling interval: with a 30-tick
  interval the divergence shows up at 330, while the real divergence is at 301. Find the
  window with the coarse trail first, then the exact tick with `trailEvery: 1`.
- Injecting the drift into `ship.vy` does not work: wall clamping writes `vy = 0` and erases
  the drift. Pick a field that accumulates continuously, like `spawnTimer`.
- A recording belongs to the version of `step` it was taken with. That is what
  `Recording.version` is for.

## License

MIT
