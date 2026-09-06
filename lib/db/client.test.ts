import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pools } from "./schema";

// 延遲連線：模組載入不得讀 DATABASE_URL（否則 next build 收集 page data 會整個失敗），
// 但第一次真的用到時，行為要與直接建立的 client 完全相同。

const ORIGINAL = process.env.DATABASE_URL;

async function freshImport() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/testdb";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

describe("db client", () => {
  it("缺少 DATABASE_URL 時，匯入不丟錯，直到真的用到才丟", async () => {
    delete process.env.DATABASE_URL;
    const { db } = await freshImport(); // 這行不該丟錯
    expect(() => db.select().from(pools)).toThrow(/DATABASE_URL/);
  });

  it("查詢建構經過 Proxy 後仍正確（this 綁回真正的 drizzle 實例）", async () => {
    const { db } = await freshImport();
    const { sql } = db.select().from(pools).toSQL();
    expect(sql).toMatch(/from "pools"/i);
  });

  it("postgres client 的方法可取用", async () => {
    const { client } = await freshImport();
    expect(typeof client.end).toBe("function");
  });
});
