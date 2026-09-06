import { describe, expect, it } from "vitest";
import { computeStockMetrics, gatePool } from "./snapshot";

describe("computeStockMetrics", () => {
  it("31 列視窗：change30d 與 change1d 正確", () => {
    // closes[0]=110, closes[1]=100, closes[30]=100
    const closes = [110, 100, ...Array(29).fill(100)];
    const m = computeStockMetrics(closes);
    expect(m).not.toBeNull();
    expect(m!.change30d).toBeCloseTo(10, 6); // +10%
    expect(m!.change1d).toBeCloseTo(10, 6);
    expect(m!.direction).toBe("UP");
    expect(m!.rarity).toBe("R");
  });

  it("視窗不足 31 列回 null（企劃書 5.2 條件4）", () => {
    expect(computeStockMetrics([100, 99, 98])).toBeNull();
    expect(computeStockMetrics(Array(30).fill(100))).toBeNull();
  });

  it("僅 31 列也可計算", () => {
    expect(computeStockMetrics(Array(31).fill(100))).toEqual({
      direction: "UP",
      rarity: "C",
      change30d: 0,
      change1d: 0,
      close: 100,
    });
  });

  it("收盤價無效回 null", () => {
    expect(computeStockMetrics([0, ...Array(31).fill(100)])).toBeNull();
  });
});

describe("gatePool（常態開放，無鎖池設計）", () => {
  const mk = (n: number, dir: "UP" | "DOWN") =>
    Array.from({ length: n }, () => ({
      direction: dir,
      rarity: "C" as const,
      change30d: dir === "UP" ? 1 : -1,
      change1d: 0.1,
      close: 100,
    }));

  it("有漲有跌：開放，統計正確", () => {
    const r = gatePool([...mk(20, "UP"), ...mk(15, "DOWN")]);
    expect(r.isOpen).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.upStockCount).toBe(20);
    expect(r.downStockCount).toBe(15);
  });

  it("單方向（全上漲）：仍開放（企劃書 5.4 方案B）", () => {
    const r = gatePool(mk(50, "UP"));
    expect(r.isOpen).toBe(true);
    expect(r.upStockCount).toBe(50);
    expect(r.downStockCount).toBe(0);
  });
});
