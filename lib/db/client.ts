import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;
export type BatchStatements = BatchItem<"sqlite">[];

let resolved: Db | null = null;
let pending: Promise<Db> | null = null;

// Workers 內由平台綁定取得 D1（vinext 於建置時外部化 cloudflare:workers）；
// Node（tsx scripts）無此模組 → 退回 D1 HTTP API。
async function resolveDb(): Promise<Db> {
  try {
    const { env } = await import("cloudflare:workers");
    return drizzle(env.DB, { schema });
  } catch {
    const { createD1HttpDatabase } = await import("./d1-http");
    return drizzle(createD1HttpDatabase(), { schema });
  }
}

// 延遲初始化：模組被 import 時不該解析連線。過去在此處以 top-level await
// 解析，導致 next build 收集頁面資料階段就走進 D1 HTTP 分支並因缺環境變數
// 而 throw，整個 build 失敗。改為第一次實際取用時才解析。
export function getDb(): Promise<Db> {
  if (resolved) return Promise.resolve(resolved);
  // 併發呼叫共用同一個解析 promise，避免重複建立
  pending ??= resolveDb().then((db) => (resolved = db));
  return pending;
}

// drizzle 的 batch 型別要求非空 tuple；實際呼叫端皆保證非空（先檢查再組陣列）。
// D1 平台綁定的 batch 為原子執行；HTTP 模式由 d1-http.ts 逐一執行。
export async function batchAll(statements: BatchStatements): Promise<unknown[]> {
  if (statements.length === 0) return [];
  const db = await getDb();
  return db.batch(
    statements as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  );
}
