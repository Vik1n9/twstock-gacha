import { describe, expect, it } from "vitest";
import { candidateDates, collectMissingDays, isoOf } from "./catchup";
import type { FetchDailyResult } from "./twse";

const day = (date: string): FetchDailyResult => ({
  date,
  rows: [{ stockCode: "2330", close: 1000, volume: 1 }],
});

/** 假的 TWSE：只有列出的日期算交易日，其餘回 null（假日） */
const fakeTwse = (tradingDays: string[]) => {
  const set = new Set(tradingDays);
  return async (ymd: string) => (set.has(isoOf(ymd)) ? day(isoOf(ymd)) : null);
};

const collect = (
  candidates: string[],
  stored: string[],
  tradingDays: string[],
  maxDays = 3,
) =>
  collectMissingDays({
    candidates,
    stored: new Set(stored),
    maxDays,
    fetchDay: fakeTwse(tradingDays),
    throttleMs: 0,
  });

describe("isoOf", () => {
  it("YYYYMMDD → YYYY-MM-DD", () => {
    expect(isoOf("20260911")).toBe("2026-09-11");
  });
});

describe("candidateDates", () => {
  // 2026-09-12 是週六
  const sat = new Date("2026-09-12T10:00:00Z");

  it("由舊到新，且跳過週末", () => {
    expect(candidateDates(sat, 5)).toEqual([
      "20260908", // 二
      "20260909", // 三
      "20260910", // 四
      "20260911", // 五
      // 20260912 週六略過
    ]);
  });

  it("回溯天數決定視窗大小", () => {
    expect(candidateDates(sat, 1)).toEqual([]); // 只有週六本身
    expect(candidateDates(sat, 3)).toEqual(["20260910", "20260911"]);
  });
});

describe("collectMissingDays", () => {
  const candidates = ["20260908", "20260909", "20260910", "20260911"];
  const tradingDays = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];

  it("全部已入庫時不抓任何東西", async () => {
    const r = await collect(candidates, tradingDays, tradingDays);
    expect(r.days).toEqual([]);
    expect(r.reachedCap).toBe(false);
  });

  it("只缺最新一天（正常情況）", async () => {
    const r = await collect(candidates, tradingDays.slice(0, 3), tradingDays);
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-11"]);
    expect(r.reachedCap).toBe(false);
  });

  it("補中間的洞，不是只看尾端落差", async () => {
    // 2026-09-11 漏跑，之後 09-14 的 cron 正常寫入 → 最新日期已經前進，
    // 若用「往回走到第一個已入庫的日期就停」，09-11 這個洞永遠補不到
    const withMonday = [...candidates, "20260914"];
    const trading = [...tradingDays, "2026-09-14"];
    const stored = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-14"];
    const r = await collect(withMonday, stored, trading);
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-11"]);
  });

  it("假日不算交易日，也不佔用上限", async () => {
    // 09-09 當成假日：TWSE 沒有資料，不該被收進來
    const trading = ["2026-09-08", "2026-09-10", "2026-09-11"];
    const r = await collect(candidates, [], trading, 3);
    expect(r.days.map((d) => d.date)).toEqual([
      "2026-09-08",
      "2026-09-10",
      "2026-09-11",
    ]);
    expect(r.reachedCap).toBe(false);
  });

  it("超過上限時由舊往新填，並回報 reachedCap", async () => {
    const r = await collect(candidates, [], tradingDays, 2);
    // 取最舊的兩天，不是最新的兩天——新補的資料必須接在既有資料後面，
    // change1d 才不會跨過洞算成多日漲跌
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-08", "2026-09-09"]);
    expect(r.reachedCap).toBe(true);
  });

  it("剛好補滿上限、且沒有更多缺漏時不算達上限", async () => {
    const r = await collect(candidates, tradingDays.slice(0, 2), tradingDays, 2);
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(r.reachedCap).toBe(false);
  });

  it("回傳順序永遠由舊到新", async () => {
    const r = await collect(candidates, [], tradingDays, 10);
    expect(r.days.map((d) => d.date)).toEqual(tradingDays);
  });
});
