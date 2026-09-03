import { describe, expect, it } from "vitest";
import { THRUST } from "../src/input";
import {
  parseRecording,
  serialize,
  verifyRecording,
  type Recording,
} from "../src/recording";
import { recordSession } from "../src/session";
import { panicPilot } from "../src/sim";

describe("corrupt recording detection", () => {
  it("throws when header tick count mismatches blocks", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    broken.runs[3].count += 1;
    expect(() => parseRecording(serialize(broken))).toThrow(/corrupt recording/);
  });

  it("rejects unknown version", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    (broken as { version: number }).version = 2;
    expect(() => parseRecording(serialize(broken))).toThrow(/version/);
  });

  it("valid recording passes verification", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const result = verifyRecording(parseRecording(serialize(recording)));
    expect(result.ok).toBe(true);
    expect(result.divergedAt).toBe(null);
  });

  it("modifying input of single tick causes verification failure", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const broken = JSON.parse(serialize(recording)) as Recording;

    // Find tick where 40th block begins, corrupt input of that block.
    let corruptedTick = 0;
    for (let i = 0; i < 40; i++) corruptedTick += broken.runs[i].count;
    broken.runs[40].input ^= THRUST;

    const result = verifyRecording(broken);
    expect(result.ok).toBe(false);
    // Since trail is sampled every 30 ticks, divergence appears at next sample.
    expect(result.divergedAt).toBe(Math.ceil((corruptedTick + 1) / 30) * 30);
  });
});
