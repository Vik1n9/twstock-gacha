import { describe, expect, it } from "vitest";
import {
  computeStockMetrics,
  gatePool,
  resolveChangeMarks,
  type PrevMarkRow,
} from "./snapshot";

// 由快照日往回逐日產生測試用序列（含假日空缺時請直接寫 rows）
const seq = (from: string, closes: number[]) =>
  closes.map((close, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    return { date: d.toISOString().slice(0, 10), close };
  });

describe("computeStockMetrics（30 個日曆日視窗）", () => {
  it("基準取 30 個日曆日前那天的收盤", () => {
    // 2026-09-07 往回 30 個日曆日＝2026-08-08
    const rows = [
      { date: "2026-09-07", close: 110 },
      { date: "2026-09-04", close: 100 },
      { date: "2026-08-08", close: 100 },
      { date: "2026-08-07", close: 55 }, // 更早的價格不該被選中
    ];
    const m = computeStockMetrics(rows);
    expect(m).not.toBeNull();
    expect(m!.change30d).toBeCloseTo(10, 6);
    expect(m!.change1d).toBeCloseTo(10, 6); // 對前一個交易日，仍是交易日基準
    expect(m!.direction).toBe("UP");
    expect(m!.rarity).toBe("R");
    expect(m!.close).toBe(110);
  });

  it("第 30 個日曆日逢假日：往前取最近一個有收盤的交易日", () => {
    // 2026-08-08 是週六，沒有收盤 → 應退到 2026-08-07
    const rows = [
      { date: "2026-09-07", close: 120 },
      { date: "2026-09-04", close: 118 },
      { date: "2026-08-07", close: 100 },
      { date: "2026-08-06", close: 50 },
    ];
    const m = computeStockMetrics(rows);
    expect(m!.change30d).toBeCloseTo(20, 6);
    expect(m!.rarity).toBe("SR");
  });

  it("30 個日曆日前沒有任何收盤（新上市）回 null", () => {
    // 最早只到 2026-08-20，跨不過 2026-08-08 的界線
    const rows = [
      { date: "2026-09-07", close: 100 },
      { date: "2026-08-20", close: 90 },
    ];
    expect(computeStockMetrics(rows)).toBeNull();
  });

  it("空序列回 null", () => {
    expect(computeStockMetrics([])).toBeNull();
  });

  it("交易日數量少但跨得過 30 日曆日，仍可計算", () => {
    // 只有 3 列，但最舊那列早於界線 → 足夠
    const rows = [
      { date: "2026-09-07", close: 100 },
      { date: "2026-09-04", close: 100 },
      { date: "2026-07-31", close: 100 },
    ];
    expect(computeStockMetrics(rows)).toEqual({
      direction: "UP",
      rarity: "C",
      change30d: 0,
      change1d: 0,
      close: 100,
    });
  });

  it("下跌取絕對值分級，方向為 DOWN", () => {
    const rows = [
      { date: "2026-09-07", close: 80 },
      { date: "2026-09-04", close: 82 },
      { date: "2026-08-08", close: 100 },
    ];
    const m = computeStockMetrics(rows);
    expect(m!.change30d).toBeCloseTo(-20, 6);
    expect(m!.direction).toBe("DOWN");
    expect(m!.rarity).toBe("SR");
  });

  it("收盤價無效回 null", () => {
    expect(
      computeStockMetrics([
        { date: "2026-09-07", close: 0 },
        { date: "2026-08-08", close: 100 },
      ]),
    ).toBeNull();
    expect(
      computeStockMetrics([
        { date: "2026-09-07", close: 100 },
        { date: "2026-08-08", close: 0 },
      ]),
    ).toBeNull();
  });

  it("連續交易日序列：基準落在第 30 個日曆日", () => {
    const rows = seq("2026-09-07", [130, ...Array(40).fill(100)]);
    const m = computeStockMetrics(rows);
    expect(m!.change30d).toBeCloseTo(30, 6);
    expect(m!.rarity).toBe("SSR");
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

describe("resolveChangeMarks（變動標記逐日沿用）", () => {
  const prev = (
    o: Partial<PrevMarkRow> & { direction: "UP" | "DOWN"; rarity: "C" | "R" | "SR" | "SSR" },
  ): PrevMarkRow => ({
    prevRarity: null,
    rarityChangedOn: null,
    directionChangedOn: null,
    ...o,
  });

  it("沒有前一個快照日：三欄皆 null", () => {
    expect(
      resolveChangeMarks(undefined, { direction: "UP", rarity: "R" }, "2026-09-07"),
    ).toEqual({
      prevRarity: null,
      rarityChangedOn: null,
      directionChangedOn: null,
    });
  });

  it("稀有度改變：記下前一階與今天", () => {
    const r = resolveChangeMarks(
      prev({ direction: "DOWN", rarity: "R" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-07");
  });

  it("稀有度不變且前值為 null：仍是 null（不知道何時開始）", () => {
    const r = resolveChangeMarks(
      prev({ direction: "UP", rarity: "C" }),
      { direction: "UP", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBeNull();
    expect(r.rarityChangedOn).toBeNull();
  });

  it("稀有度不變且前值有紀錄：整組繼承，不被今天蓋掉", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "SR",
        prevRarity: "R",
        rarityChangedOn: "2026-09-04",
      }),
      { direction: "UP", rarity: "SR" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-04");
  });

  it("方向翻轉：記下今天", () => {
    const r = resolveChangeMarks(
      prev({ direction: "UP", rarity: "C" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.directionChangedOn).toBe("2026-09-07");
  });

  it("方向不變：繼承舊日期", () => {
    const r = resolveChangeMarks(
      prev({ direction: "DOWN", rarity: "C", directionChangedOn: "2026-08-20" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.directionChangedOn).toBe("2026-08-20");
  });

  it("稀有度變、方向沒變：只動稀有度那組", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "R",
        prevRarity: "C",
        rarityChangedOn: "2026-08-28",
        directionChangedOn: "2026-08-20",
      }),
      { direction: "UP", rarity: "SR" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-07");
    expect(r.directionChangedOn).toBe("2026-08-20");
  });

  it("方向變、稀有度沒變：只動方向那組", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "C",
        prevRarity: "R",
        rarityChangedOn: "2026-08-28",
        directionChangedOn: "2026-08-20",
      }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-08-28");
    expect(r.directionChangedOn).toBe("2026-09-07");
  });
});
