import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hex } from "../src/hash";
import { serialize } from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;
const TICKS = 1800; // 30 seconds
const OUT = resolve(process.cwd(), "test/fixtures/canyon-session.json");

const { recording, final } = recordSession(SEED, panicPilot, TICKS, 30);
const json = serialize(recording);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json + "\n", "utf8");

const raw = recording.ticks * 4; // 4 bytes raw input per tick
console.log(`recording written: ${OUT}`);
console.log(`  seed         : ${recording.seed}`);
console.log(`  tick         : ${recording.ticks} (${TICKS / 60} s)`);
console.log(`  run blocks   : ${recording.runs.length}`);
console.log(
  `  compression  : ${raw} B raw → ${recording.runs.length * 4} B run (${(raw / (recording.runs.length * 4)).toFixed(1)}x)`,
);
console.log(`  JSON size    : ${json.length} B`);
console.log(`  hash samples : ${recording.trail.length}`);
console.log(`  final hash   : 0x${hex(recording.finalHash)}`);
console.log(`  dodged       : ${final.dodged} · hits: ${final.hits}`);
