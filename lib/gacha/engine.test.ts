import { describe, expect, it } from "vitest";
import {
  buildPoolState,
  drawOnce,
  type PoolState,
} from "./engine";

// 固定 RNG：由種子產生 [0,1) 序列（mulberry32）
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pool(
  upCounts: Partial<Record<"C" | "R" | "SR" | "SSR", number>>,
  downCounts: Partial<Record<"C" | "R" | "SR" | "SSR", number>>,
): PoolState {
  const rows: {
    stockCode: string;
    direction: string;
    rarity: string;
    weight: number;
  }[] = [];
  let id = 0;
  const add = (dir: string, rarity: string, n: number) => {
    for (let i = 0; i < n; i++)
      rows.push({
        stockCode: `${dir}${rarity}${id++}`,
        direction: dir,
        rarity,
        weight: 1,
      });
  };
  add("UP", "C", upCounts.C ?? 0);
  add("UP", "R", upCounts.R ?? 0);
  add("UP", "SR", upCounts.SR ?? 0);
  add("UP", "SSR", upCounts.SSR ?? 0);
  add("DOWN", "C", downCounts.C ?? 0);
  add("DOWN", "R", downCounts.R ?? 0);
  add("DOWN", "SR", downCounts.SR ?? 0);
  add("DOWN", "SSR", downCounts.SSR ?? 0);
  return buildPoolState(rows);
}

describe("drawOnce 方向機率（企劃書 9.2）", () => {
  it("70/30 池：方向比 ≈ 70/30", () => {
    const p = pool({ C: 56, R: 10, SR: 3, SSR: 1 }, { C: 24, R: 5, SR: 1 });
    const n = 50000;
    let up = 0;
    const rng = mulberry32(42);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.direction === "UP") up++;
    }
    const rate = up / n;
    expect(rate).toBeGreaterThan(0.695);
    expect(rate).toBeLessThan(0.705);
  });

  it("48/48 池：方向比 ≈ 50/50", () => {
    const p = pool({ C: 17, R: 19, SR: 8, SSR: 4 }, { C: 28, R: 15, SR: 5 });
    const n = 50000;
    let up = 0;
    const rng = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.direction === "UP") up++;
    }
    expect(Math.abs(up / n - 0.5)).toBeLessThan(0.005);
  });
});

describe("drawOnce 全市場池固定方向機率（企劃書 9.1）", () => {
  it("fixedUpRate=0.5：池內分布 90/10 時方向仍為 50/50", () => {
    const rows = [
      ...Array.from({ length: 90 }, (_, i) => ({
        stockCode: `U${i}`,
        direction: "UP",
        rarity: "C",
        weight: 1,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        stockCode: `D${i}`,
        direction: "DOWN",
        rarity: "C",
        weight: 1,
      })),
    ];
    const p = buildPoolState(rows, 0.5);
    const n = 50000;
    let up = 0;
    const rng = mulberry32(2024);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.direction === "UP") up++;
    }
    expect(Math.abs(up / n - 0.5)).toBeLessThan(0.005);
  });

  it("板塊池（fixedUpRate=null）不受影響：仍依池內分布", () => {
    const rows = [
      ...Array.from({ length: 90 }, (_, i) => ({
        stockCode: `U${i}`,
        direction: "UP",
        rarity: "C",
        weight: 1,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        stockCode: `D${i}`,
        direction: "DOWN",
        rarity: "C",
        weight: 1,
      })),
    ];
    const p = buildPoolState(rows);
    const n = 50000;
    let up = 0;
    const rng = mulberry32(2024);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.direction === "UP") up++;
    }
    expect(up / n).toBeGreaterThan(0.89);
  });
});

describe("drawOnce 稀有度機率（企劃書 9.4）", () => {
  it("桶齊全時：方向內 80/15/4/1", () => {
    const p = pool(
      { C: 40, R: 8, SR: 2, SSR: 1 },
      { C: 40, R: 8, SR: 2, SSR: 1 },
    );
    const n = 100000;
    const counts = { UP: { C: 0, R: 0, SR: 0, SSR: 0 }, DOWN: { C: 0, R: 0, SR: 0, SSR: 0 } };
    const rng = mulberry32(99);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r) counts[r.direction][r.rolledRarity]++;
    }
    const upTotal = counts.UP.C + counts.UP.R + counts.UP.SR + counts.UP.SSR;
    expect(Math.abs(counts.UP.C / upTotal - 0.8)).toBeLessThan(0.003);
    expect(Math.abs(counts.UP.R / upTotal - 0.15)).toBeLessThan(0.003);
    expect(Math.abs(counts.UP.SR / upTotal - 0.04)).toBeLessThan(0.002);
    expect(Math.abs(counts.UP.SSR / upTotal - 0.01)).toBeLessThan(0.002);
  });

  it("空池降級：DOWN 無 SSR 時，DOWN 抽中 SSR 降為 SR", () => {
    const p = pool({ C: 40, R: 8, SR: 2, SSR: 1 }, { C: 45, R: 9, SR: 3 });
    const n = 100000;
    let downFinalSR = 0;
    let downR = 0;
    let downTotal = 0;
    const rng = mulberry32(123);
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.direction === "DOWN") {
        downTotal++;
        if (r.finalRarity === "SR") downFinalSR++;
        if (r.finalRarity === "R") downR++;
        if (r.rolledRarity === "SSR") {
          expect(r.finalRarity).toBe("SR"); // DOWN 無 SSR 桶：必降級
        }
      }
    }
    // 降級補償：SR 實得 = 4%（自然）+ 1%（SSR 降級）= 5%
    expect(Math.abs(downFinalSR / downTotal - 0.05)).toBeLessThan(0.002);
    // R 不受影響
    expect(Math.abs(downR / downTotal - 0.15)).toBeLessThan(0.003);
  });

  it("權重：weight=100 的股票被抽出比例 ≈ 100/(100+n)", () => {
    const rows = [
      { stockCode: "HOT", direction: "UP", rarity: "C", weight: 100 },
      { stockCode: "A", direction: "UP", rarity: "C", weight: 1 },
      { stockCode: "B", direction: "UP", rarity: "C", weight: 1 },
    ];
    const p = buildPoolState(rows);
    const rng = mulberry32(555);
    let hot = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = drawOnce(p, rng);
      if (r?.stockCode === "HOT") hot++;
    }
    const expected = 100 / 102;
    expect(Math.abs(hot / n - expected)).toBeLessThan(0.01);
  });

  it("方向空池回 null（企劃書 10.3）", () => {
    const p: PoolState = {
      upStockCount: 0,
      downStockCount: 0,
      fixedUpRate: null,
      buckets: new Map(),
    };
    expect(drawOnce(p)).toBeNull();
  });
});
