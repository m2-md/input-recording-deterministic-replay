import type { State } from "./sim";

// Single buffer to inspect the 64 bits of a float as two 32-bit halves.
const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const u32 = new Uint32Array(buf);

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixU32(h: number, v: number): number {
  for (let i = 0; i < 4; i++) {
    h ^= (v >>> (i * 8)) & 0xff;
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Mix number bit-by-bit: 0.1 vs 0.100000001 yields different hashes. */
export function mixNumber(h: number, x: number): number {
  f64[0] = x + 0; // converts -0 to +0; wall clamping can produce -0
  return mixU32(mixU32(h, u32[0]), u32[1]);
}

/** Hashes entire simulation state into a single 32-bit number (FNV-1a). */
export function hashState(s: State): number {
  let h = FNV_OFFSET >>> 0;
  h = mixNumber(h, s.tick);
  h = mixNumber(h, s.time);
  h = mixNumber(h, s.dodged);
  h = mixNumber(h, s.hits);
  h = mixNumber(h, s.spawnTimer);
  h = mixNumber(h, s.nextId);
  h = mixNumber(h, s.ship.x);
  h = mixNumber(h, s.ship.y);
  h = mixNumber(h, s.ship.vx);
  h = mixNumber(h, s.ship.vy);
  h = mixNumber(h, s.rocks.length);
  for (const rock of s.rocks) {
    h = mixNumber(h, rock.id);
    h = mixNumber(h, rock.x);
    h = mixNumber(h, rock.y);
    h = mixNumber(h, rock.r);
    h = mixNumber(h, rock.vx);
  }
  return h >>> 0;
}

/** 8-digit hex for HUD and recording headers. */
export function hex(h: number): string {
  return h.toString(16).padStart(8, "0");
}
