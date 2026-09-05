import { describe, expect, it } from "vitest";
import { median } from "./stats";

describe("median（企劃書 6 板塊強度）", () => {
  it("奇數個取中間", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("偶數個取平均", () => {
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  it("空集合回 null", () => {
    expect(median([])).toBeNull();
  });
  it("負值排序正確", () => {
    expect(median([-10, 5, -3, 1])).toBe(-1);
  });
});
