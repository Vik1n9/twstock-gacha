import { describe, expect, it } from "vitest";
import { argOf, hasFlag, numberArg } from "./args";

// argv 前兩格是 node 與 script 路徑，測試一律比照真實形狀補上
const argv = (...rest: string[]) => ["node", "script.ts", ...rest];

describe("argOf", () => {
  it("取旗標後面那一格", () => {
    expect(argOf("--date", argv("--date", "2026-09-11"))).toBe("2026-09-11");
  });

  it("同名旗標重複時取最後一個（後蓋前）", () => {
    // 這正是 npm run backfill -- --days 4 的形狀：
    // package.json 寫死的 --days 60 在前，使用者追加的在後
    expect(numberArg("--days", 60, argv("--days", "60", "--days", "4"))).toBe(4);
    expect(argOf("--from", argv("--from", "2026-01-01", "--from", "2026-08-01")))
      .toBe("2026-08-01");
  });

  it("旗標不存在時回傳 undefined", () => {
    expect(argOf("--date", argv("--force"))).toBeUndefined();
  });

  it("旗標在最後一格、沒有值時回傳 undefined", () => {
    expect(argOf("--date", argv("--date"))).toBeUndefined();
  });
});

describe("numberArg", () => {
  it("缺少旗標時用 fallback", () => {
    expect(numberArg("--days", 60, argv())).toBe(60);
  });

  it("非數字或 0 時用 fallback", () => {
    expect(numberArg("--days", 60, argv("--days", "abc"))).toBe(60);
    expect(numberArg("--days", 60, argv("--days", "0"))).toBe(60);
  });

  it("正常數值照收", () => {
    expect(numberArg("--days", 60, argv("--days", "4"))).toBe(4);
  });
});

describe("hasFlag", () => {
  it("有無旗標", () => {
    expect(hasFlag("--force", argv("--days", "4", "--force"))).toBe(true);
    expect(hasFlag("--force", argv("--days", "4"))).toBe(false);
  });
});
