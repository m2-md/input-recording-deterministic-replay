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

describe("bozuk kayıt tespiti", () => {
  it("başlıktaki tick sayısı bloklarla uyuşmazsa parse patlar", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    broken.runs[3].count += 1;
    expect(() => parseRecording(serialize(broken))).toThrow(/bozuk kayıt/);
  });

  it("bilinmeyen sürüm reddedilir", () => {
    const { recording } = recordSession(20260723, panicPilot, 600);
    const broken = JSON.parse(serialize(recording)) as Recording;
    (broken as { version: number }).version = 2;
    expect(() => parseRecording(serialize(broken))).toThrow(/sürüm/);
  });

  it("sağlam kayıt doğrulamayı geçer", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const result = verifyRecording(parseRecording(serialize(recording)));
    expect(result.ok).toBe(true);
    expect(result.divergedAt).toBe(null);
  });

  it("tek bir tick'in girdisi değişirse doğrulama düşer", () => {
    const { recording } = recordSession(20260723, panicPilot, 900, 30);
    const broken = JSON.parse(serialize(recording)) as Recording;

    // 40. bloğun başladığı tick'i bul, o bloğun girdisini boz.
    let corruptedTick = 0;
    for (let i = 0; i < 40; i++) corruptedTick += broken.runs[i].count;
    broken.runs[40].input ^= THRUST;

    const result = verifyRecording(broken);
    expect(result.ok).toBe(false);
    // İz 30 tick'te bir örneklendiği için ayrılma bir sonraki örnekte görünür.
    expect(result.divergedAt).toBe(Math.ceil((corruptedTick + 1) / 30) * 30);
  });
});
