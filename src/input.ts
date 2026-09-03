/**
 * An input is a single integer: each key corresponds to one bit.
 * This is why the recording format is so lightweight.
 */
export type InputBits = number;

export const NONE = 0;
export const THRUST = 1 << 0;
export const LEFT = 1 << 1;
export const RIGHT = 1 << 2;

export const ALL_BITS = THRUST | LEFT | RIGHT;

export function has(input: InputBits, bit: number): boolean {
  return (input & bit) !== 0;
}

/** Human-readable format for HUD and error messages: "THRUST|LEFT" */
export function formatInput(input: InputBits): string {
  if (input === NONE) return "-";
  const parts: string[] = [];
  if (has(input, THRUST)) parts.push("THRUST");
  if (has(input, LEFT)) parts.push("LEFT");
  if (has(input, RIGHT)) parts.push("RIGHT");
  return parts.join("|");
}
