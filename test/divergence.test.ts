import { describe, expect, it } from "vitest";
import { findDivergence, type HashSample } from "../src/recording";

const trail = (hashes: readonly number[], every = 30): HashSample[] =>
  hashes.map((hash, i) => ({ tick: (i + 1) * every, hash }));

describe("findDivergence", () => {
  it("aynı iz → null", () => {
    expect(findDivergence(trail([1, 2, 3, 4]), trail([1, 2, 3, 4]))).toBe(null);
  });

  it("ilk farklı örneğin tick'ini döndürür", () => {
    expect(findDivergence(trail([1, 2, 3, 4]), trail([1, 2, 9, 4]))).toBe(90);
  });

  it("biri erken bittiyse ilk fazlalık örneğin tick'i", () => {
    expect(findDivergence(trail([1, 2, 3]), trail([1, 2]))).toBe(90);
  });

  it("boş izler ayrışmaz", () => {
    expect(findDivergence([], [])).toBe(null);
  });
});
