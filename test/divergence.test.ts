import { describe, expect, it } from "vitest";
import { findDivergence, type HashSample } from "../src/recording";

const trail = (hashes: readonly number[], every = 30): HashSample[] =>
  hashes.map((hash, i) => ({ tick: (i + 1) * every, hash }));

describe("findDivergence", () => {
  it("identical trail → null", () => {
    expect(findDivergence(trail([1, 2, 3, 4]), trail([1, 2, 3, 4]))).toBe(null);
  });

  it("returns tick of first differing sample", () => {
    expect(findDivergence(trail([1, 2, 3, 4]), trail([1, 2, 9, 4]))).toBe(90);
  });

  it("tick of first extra sample if one finished early", () => {
    expect(findDivergence(trail([1, 2, 3]), trail([1, 2]))).toBe(90);
  });

  it("empty trails do not diverge", () => {
    expect(findDivergence([], [])).toBe(null);
  });
});
