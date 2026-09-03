import { has, LEFT, NONE, RIGHT, THRUST, type InputBits } from "./input";
import type { Rng } from "./rng";

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Rock {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
}

export interface State {
  tick: number;
  time: number;
  ship: Ship;
  rocks: Rock[];
  dodged: number;
  hits: number;
  spawnTimer: number;
  nextId: number;
}

export const WORLD = { w: 640, h: 480 };

const GRAVITY = 900; // px/s²
const THRUST_ACC = 1750; // px/s²
const SIDE_ACC = 1100; // px/s²
const DRAG_X = 2.4; // 1/s
const DRAG_Y = 0.8; // 1/s
const SHIP_R = 12;
const SPAWN_EVERY = 0.32; // saniye
const ROCK_MIN_R = 10;
const ROCK_MAX_R = 26;
const ROCK_MIN_VX = 170; // px/s (sola doğru)
const ROCK_MAX_VX = 320;
const KNOCKBACK = 260; // px/s

/** Her oturumun başladığı yer. Kaydın örtük başlangıç durumu budur. */
export function createState(): State {
  return {
    tick: 0,
    time: 0,
    ship: { x: 140, y: 240, vx: 0, vy: 0, r: SHIP_R },
    rocks: [],
    dodged: 0,
    hits: 0,
    spawnTimer: 0,
    nextId: 1,
  };
}

/**
 * Oyunun tek gerçeği. DOM yok, Math.random yok, Date.now yok.
 * (state, input, dt, rng) dörtlüsü sonucu tam belirler.
 */
export function step(
  state: State,
  input: InputBits,
  dt: number,
  rng: Rng,
): State {
  // 1) Girdi → ivme
  const s = state.ship;
  let ax = 0;
  if (has(input, LEFT)) ax -= SIDE_ACC;
  if (has(input, RIGHT)) ax += SIDE_ACC;
  const ay = GRAVITY - (has(input, THRUST) ? THRUST_ACC : 0);

  let vx = (s.vx + ax * dt) * Math.max(0, 1 - DRAG_X * dt);
  let vy = (s.vy + ay * dt) * Math.max(0, 1 - DRAG_Y * dt);

  let x = s.x + vx * dt;
  let y = s.y + vy * dt;

  // 2) Duvarlar
  if (x < s.r) {
    x = s.r;
    vx = 0;
  } else if (x > WORLD.w - s.r) {
    x = WORLD.w - s.r;
    vx = 0;
  }
  if (y < s.r) {
    y = s.r;
    vy = 0;
  } else if (y > WORLD.h - s.r) {
    y = WORLD.h - s.r;
    vy = 0;
  }

  // 3) Kayalar: sola akar, ekranı geçen atlatılmış sayılır, değen vurur.
  const rocks: Rock[] = [];
  let dodged = state.dodged;
  let hits = state.hits;
  for (const rock of state.rocks) {
    const rx = rock.x - rock.vx * dt;
    if (rx + rock.r < 0) {
      dodged += 1;
      continue;
    }
    const dx = rx - x;
    const dy = rock.y - y;
    const reach = rock.r + s.r;
    if (dx * dx + dy * dy <= reach * reach) {
      hits += 1;
      const d = Math.max(1e-6, Math.sqrt(dx * dx + dy * dy));
      vx += (-dx / d) * KNOCKBACK;
      vy += (-dy / d) * KNOCKBACK;
      continue;
    }
    rocks.push({ id: rock.id, x: rx, y: rock.y, r: rock.r, vx: rock.vx });
  }

  // 4) Doğurma: rastgelelik SADECE parametreden gelen rng'den.
  let spawnTimer = state.spawnTimer + dt;
  let nextId = state.nextId;
  while (spawnTimer >= SPAWN_EVERY) {
    spawnTimer -= SPAWN_EVERY;
    const r = ROCK_MIN_R + rng() * (ROCK_MAX_R - ROCK_MIN_R);
    rocks.push({
      id: nextId++,
      x: WORLD.w + r,
      y: r + rng() * (WORLD.h - 2 * r),
      r,
      vx: ROCK_MIN_VX + rng() * (ROCK_MAX_VX - ROCK_MIN_VX),
    });
  }

  return {
    tick: state.tick + 1,
    time: state.time + dt,
    ship: { x, y, vx, vy, r: s.r },
    rocks,
    dodged,
    hits,
    spawnTimer,
    nextId,
  };
}

/** Duruma bakıp girdi üreten deterministik senaryo (test "pilotu"). */
export type Pilot = (state: State) => InputBits;

export function panicPilot(state: State): InputBits {
  const { ship } = state;
  let input: InputBits = NONE;
  if (ship.vy > 0 || ship.y > WORLD.h * 0.55) input |= THRUST;

  let threat: Rock | undefined;
  let best = Infinity;
  for (const rock of state.rocks) {
    const dx = rock.x - ship.x;
    if (dx < -rock.r) continue;
    if (dx < best) {
      best = dx;
      threat = rock;
    }
  }
  if (threat && best < 180) {
    const dy = threat.y - ship.y;
    // Kaya altımdaysa yukarı kaç, üstümdeyse gazı kes.
    if (dy > 0) input |= THRUST;
    else input &= ~THRUST;
    // Hizadaysam frene bas, değilse ileri devam.
    input |= Math.abs(dy) < threat.r + ship.r + 20 ? LEFT : RIGHT;
  }
  return input;
}
