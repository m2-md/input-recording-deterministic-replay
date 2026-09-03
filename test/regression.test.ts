import { describe, expect, it } from "vitest";
import fixture from "./fixtures/canyon-session.json";
import { hashState } from "../src/hash";
import { parseRecording, replay, verifyRecording } from "../src/recording";

describe("regression: recording from disk", () => {
  const recording = parseRecording(JSON.stringify(fixture));

  it("fixture matches its own hash trail", () => {
    expect(verifyRecording(recording).ok).toBe(true);
  });

  it("30 seconds of gameplay produces identical outcome", () => {
    const state = replay(recording);
    expect(state.tick).toBe(1800);
    expect(state.dodged).toBe(82);
    expect(state.hits).toBe(4);
    expect(hashState(state)).toBe(recording.finalHash);
  });
});
