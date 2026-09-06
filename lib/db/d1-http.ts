// D1 HTTP API client：讓 tsx scripts 在 Node 環境以 D1Database 相容介面存取遠端 D1。
// Workers 內不用這個（直接用平台綁定，見 client.ts）。
// 需要的環境變數（.env.local，見 .env.example）：
//   CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_D1_DATABASE_ID、CLOUDFLARE_API_TOKEN

import { loadEnv } from "./env";

type D1Value = string | number | bigint | boolean | null;

interface D1Meta {
  duration?: number;
  changes?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
  [key: string]: unknown;
}

interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: D1Meta;
}

export interface D1Response {
  results: Record<string, unknown>[];
  success: boolean;
  meta: D1Meta;
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

  async all(): Promise<D1Response> {
    return this.client.query(this.sql, this.params);
  }

  async run(): Promise<D1Response> {
    return this.client.query(this.sql, this.params);
  }

  // drizzle values()/raw() 用：回傳「欄位順序」的二維陣列。
  // D1 HTTP API 回傳物件陣列，JSON 欄位順序即 SQL 欄位順序。
  async raw(): Promise<unknown[]> {
    const { results } = await this.client.query(this.sql, this.params);
    return results.map((row) => Object.keys(row).map((k) => row[k]));
  }

  async values(): Promise<unknown[]> {
    return this.raw();
  }
}

class D1HttpClient {
  constructor(
    private readonly accountId: string,
    private readonly databaseId: string,
    private readonly apiToken: string,
  ) {}

  async query(sql: string, params: D1Value[]): Promise<D1QueryResult> {
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
      result?: D1QueryResult[];
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
  async batch(statements: D1HttpStatement[]): Promise<D1Response[]> {
    const out: D1Response[] = [];
    for (const stmt of statements) out.push(await stmt.run());
    return out;
  }

  async exec(sql: string): Promise<unknown> {
    return this.query(sql, []);
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
