import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;
export type BatchStatements = BatchItem<"sqlite">[];

let resolved: Db | null = null;

// Workers 內由平台綁定取得 D1（vinext 於建置時外部化 cloudflare:workers）；
// Node（tsx scripts）無此模組 → 退回 D1 HTTP API。
async function resolveDb(): Promise<Db> {
  if (resolved) return resolved;
  try {
    const { env } = await import("cloudflare:workers");
    resolved = drizzle(env.DB, { schema });
  } catch {
    const { createD1HttpDatabase } = await import("./d1-http");
    resolved = drizzle(createD1HttpDatabase(), { schema });
  }
  return resolved;
}

export const db = (await resolveDb()) as Db;

// drizzle 的 batch 型別要求非空 tuple；實際呼叫端皆保證非空（先檢查再組陣列）。
// D1 平台綁定的 batch 為原子執行；HTTP 模式由 d1-http.ts 逐一執行。
export async function batchAll(statements: BatchStatements): Promise<unknown[]> {
  if (statements.length === 0) return [];
  return db.batch(
    statements as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  );
}
