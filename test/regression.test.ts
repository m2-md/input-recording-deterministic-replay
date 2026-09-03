import { describe, expect, it } from "vitest";
import fixture from "./fixtures/canyon-session.json";
import { hashState } from "../src/hash";
import { parseRecording, replay, verifyRecording } from "../src/recording";

describe("regresyon: diskteki kayıt", () => {
  const recording = parseRecording(JSON.stringify(fixture));

  it("fixture kendi hash izini tutuyor", () => {
    expect(verifyRecording(recording).ok).toBe(true);
  });

  it("30 saniyelik oynanış aynı sonucu veriyor", () => {
    const state = replay(recording);
    expect(state.tick).toBe(1800);
    expect(state.dodged).toBe(82);
    expect(state.hits).toBe(4);
    expect(hashState(state)).toBe(recording.finalHash);
  });
});
