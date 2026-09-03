import { expect, it } from "vitest";
import { replay } from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

const SEED = 20260723;

it("replay does not touch global randomness", () => {
  const { recording } = recordSession(SEED, panicPilot, 600);
  const original = Math.random;
  Math.random = () => {
    throw new Error("replay used Math.random");
  };
  try {
    expect(() => replay(recording)).not.toThrow();
  } finally {
    Math.random = original;
  }
});
