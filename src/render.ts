import { WORLD, type State } from "./sim";

const LIVE = {
  bg: "#0b0d13",
  ship: "#4cc9f0",
  rock: "#7d6b5d",
  trail: "#1b2030",
};
const REPLAY = {
  bg: "#130b12",
  ship: "#f072b6",
  rock: "#6b5d7d",
  trail: "#241a26",
};

/** Rendering only. Makes no decisions, does not mutate state. */
export function render(
  ctx: CanvasRenderingContext2D,
  state: State,
  playback: boolean,
): void {
  const c = playback ? REPLAY : LIVE;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.strokeStyle = c.trail;
  ctx.lineWidth = 1;
  for (let y = 40; y < WORLD.h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WORLD.w, y + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = c.rock;
  for (const rock of state.rocks) {
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const s = state.ship;
  ctx.fillStyle = c.ship;
  ctx.beginPath();
  ctx.moveTo(s.x + s.r, s.y);
  ctx.lineTo(s.x - s.r, s.y - s.r * 0.8);
  ctx.lineTo(s.x - s.r * 0.4, s.y);
  ctx.lineTo(s.x - s.r, s.y + s.r * 0.8);
  ctx.closePath();
  ctx.fill();
}
