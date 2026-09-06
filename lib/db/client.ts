import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "./env";

loadEnv();

type Sql = ReturnType<typeof postgres>;
type DrizzleDb = PostgresJsDatabase<typeof schema>;

let connected: { client: Sql; db: DrizzleDb } | null = null;

// 延遲初始化：next build 收集頁面資料時不該連資料庫（例如 Vercel Preview
// 沒設 DATABASE_URL，過去會在 import 時 throw 而讓整個 build 失敗）。
// 改成第一次實際存取 db／client 時才建立連線，並在當下檢查環境變數。
function connect(): { client: Sql; db: DrizzleDb } {
  if (!connected) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("缺少 DATABASE_URL，請設定 .env.local（見 .env.example）");
    }
    // max=1：Vercel serverless 每實例單連線，避免耗盡 Neon 免費額度
    const client = postgres(url, { max: 1, idle_timeout: 20 });
    connected = { client, db: drizzle(client, { schema }) };
  }
  return connected;
}

// 以 Proxy 轉發屬性存取，保持 import { db } 的使用方式不變
function lazy<T extends object>(pick: () => T): T {
  return new Proxy(Object.create(null), {
    get: (_target, prop) => {
      const target = pick();
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

export const client = lazy(() => connect().client);
export const db = lazy(() => connect().db);
export type Db = DrizzleDb;
