// D1 HTTP API client：讓 tsx scripts 在 Node 環境以 D1Database 相容介面存取遠端 D1。
// Workers 內不用這個（直接用平台綁定，見 client.ts）。
// 需要的環境變數（.env.local，見 .env.example）：
//   CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_D1_DATABASE_ID、CLOUDFLARE_API_TOKEN

import { loadEnv } from "./env";

type D1Value = string | number | bigint | boolean | null;

// HTTP API 的 meta 是部分欄位，D1Meta（平台型別）要求的則是完整一組，
// 缺的補 0/false，讓這個 client 能真正對得上 D1Database 介面。
type D1HttpMeta = Partial<D1Meta>;

interface D1HttpQueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: D1HttpMeta;
}

function toD1Meta(meta: D1HttpMeta): D1Meta & Record<string, unknown> {
  return {
    duration: meta.duration ?? 0,
    size_after: meta.size_after ?? 0,
    rows_read: meta.rows_read ?? 0,
    rows_written: meta.rows_written ?? 0,
    last_row_id: meta.last_row_id ?? 0,
    changed_db: meta.changed_db ?? false,
    changes: meta.changes ?? 0,
  };
}

class D1HttpStatement {
  constructor(
    private readonly client: D1HttpClient,
    private readonly sql: string,
    private readonly params: D1Value[] = [],
  ) {}

  bind(...params: D1Value[]): D1HttpStatement {
    return new D1HttpStatement(this.client, this.sql, params);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const { results, meta } = await this.client.query(this.sql, this.params);
    return { results: results as T[], success: true, meta: toD1Meta(meta) };
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.all<T>();
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const { results } = await this.client.query(this.sql, this.params);
    const row = results[0];
    if (!row) return null;
    return (colName === undefined ? row : row[colName]) as T;
  }

  // drizzle values()/raw() 用：回傳「欄位順序」的二維陣列。
  // D1 HTTP API 回傳物件陣列，JSON 欄位順序即 SQL 欄位順序。
  // drizzle 只會呼叫不帶參數的形式（見 drizzle-orm/d1/session.js），
  // columnNames 這支是為了對齊平台介面；無資料列時取不到欄位名，回空陣列。
  async raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  async raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(
    options?: { columnNames?: boolean },
  ): Promise<T[] | [string[], ...T[]]> {
    const { results } = await this.client.query(this.sql, this.params);
    const rows = results.map((row) => Object.keys(row).map((k) => row[k]) as T);
    if (!options?.columnNames) return rows;
    return [results[0] ? Object.keys(results[0]) : [], ...rows];
  }
}

class D1HttpClient {
  constructor(
    private readonly accountId: string,
    private readonly databaseId: string,
    private readonly apiToken: string,
  ) {}

  async query(sql: string, params: D1Value[]): Promise<D1HttpQueryResult> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
    const body = (await res.json()) as {
      success: boolean;
      errors: { code: number; message: string }[];
      result?: D1HttpQueryResult[];
    };
    if (!res.ok || !body.success || !body.result) {
      const msg = body.errors?.map((e) => e.message).join("; ") || res.statusText;
      throw new Error(`D1 HTTP API 失敗：${msg}`);
    }
    return body.result[0];
  }

  prepare(sql: string): D1HttpStatement {
    return new D1HttpStatement(this, sql);
  }

  // D1 平台綁定的 batch 是原子的；HTTP 模式退而求其次逐一執行。
  // scripts 用途（seed/backfill/快照重跑）皆冪等，可接受。
  async batch<T = unknown>(
    statements: D1HttpStatement[],
  ): Promise<D1Result<T>[]> {
    const out: D1Result<T>[] = [];
    for (const stmt of statements) out.push(await stmt.run<T>());
    return out;
  }

  async exec(sql: string): Promise<D1ExecResult> {
    const { meta } = await this.query(sql, []);
    return { count: 1, duration: meta.duration ?? 0 };
  }

  // D1Database 介面的其餘成員：HTTP API 沒有對應能力，drizzle 也不會呼叫。
  // 保留明確的錯誤，比讓型別謊稱支援要好（過去手寫的 D1Database shim 就漏了這兩個）。
  withSession(): never {
    throw new Error("D1 HTTP 模式不支援 Sessions API");
  }

  dump(): never {
    throw new Error("D1 HTTP 模式不支援 dump()");
  }
}

export function createD1HttpDatabase(): D1HttpClient {
  loadEnv();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      "缺少 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN，請設定 .env.local（見 .env.example）",
    );
  }
  return new D1HttpClient(accountId, databaseId, apiToken);
}
