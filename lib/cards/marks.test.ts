import { describe, expect, it } from "vitest";
import { directionChangeMark, fmtChangeDate, rarityChangeMark } from "./marks";

describe("fmtChangeDate", () => {
  it("同年只寫月日", () => {
    expect(fmtChangeDate("2026-09-07", "2026-09-07")).toBe("09-07");
    expect(fmtChangeDate("2026-01-02", "2026-12-31")).toBe("01-02");
  });

  it("跨年寫完整年月日", () => {
    expect(fmtChangeDate("2025-09-07", "2026-09-07")).toBe("2025-09-07");
  });
});

describe("rarityChangeMark", () => {
  it("降階", () => {
    expect(rarityChangeMark("R", "C", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自R卡降階",
    );
  });

  it("升階", () => {
    expect(rarityChangeMark("C", "R", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自C卡升階",
    );
  });

  it("跨兩階仍只寫起點", () => {
    expect(rarityChangeMark("SSR", "R", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自SSR卡降階",
    );
  });

  it("跨年寫完整日期", () => {
    expect(rarityChangeMark("R", "C", "2025-11-20", "2026-09-07")).toBe(
      "（2025-11-20）自R卡降階",
    );
  });

  it("缺任何一項就回 null", () => {
    expect(rarityChangeMark(null, "C", "2026-09-07", "2026-09-07")).toBeNull();
    expect(rarityChangeMark("R", "C", null, "2026-09-07")).toBeNull();
    expect(rarityChangeMark("R", "C", "2026-09-07", null)).toBeNull();
    expect(rarityChangeMark(undefined, "C", undefined, undefined)).toBeNull();
  });

  it("前後同階視為無變動（資料異常的防線）", () => {
    expect(rarityChangeMark("C", "C", "2026-09-07", "2026-09-07")).toBeNull();
  });
});

describe("directionChangeMark", () => {
  it("翻成跌＝翻黑", () => {
    expect(directionChangeMark("DOWN", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）翻黑",
    );
  });

  it("翻成漲＝轉白", () => {
    expect(directionChangeMark("UP", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）轉白",
    );
  });

  it("沒有翻轉紀錄回 null", () => {
    expect(directionChangeMark("UP", null, "2026-09-07")).toBeNull();
    expect(directionChangeMark("UP", "2026-09-07", null)).toBeNull();
    expect(directionChangeMark("DOWN", undefined, undefined)).toBeNull();
  });
});
