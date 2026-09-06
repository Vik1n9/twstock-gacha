import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "./env";

function connect() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("缺少 DATABASE_URL，請設定 .env.local（見 .env.example）");
  }
  // max=1：Vercel serverless 每實例單連線，避免耗盡 Neon 免費額度
  const sql = postgres(url, { max: 1, idle_timeout: 20 });
  return { sql, db: drizzle(sql, { schema }) };
}

type Conn = ReturnType<typeof connect>;
export type Db = Conn["db"];
export type Client = Conn["sql"];

let conn: Conn | null = null;
const conn_ = (): Conn => (conn ??= connect());

// 延遲連線：模組載入當下不讀 DATABASE_URL，第一次真的查詢才建立連線。
// 原本在模組頂層就丟錯，導致 `next build` 收集 page data（只匯入路由模組、
// 不會發查詢）時整個建置失敗——沒有 DB 設定的建置環境（例如未設定 Preview
// 環境變數的 Vercel preview）連建都建不起來。缺設定仍會丟同一個錯，
// 只是延到執行期，屆時錯誤也更貼近真正的呼叫點。
//
// 取到函式時綁回真正的實例，避免 this 指向 Proxy；target 用函式以保留
// postgres 的 tagged-template 呼叫形式（client`SELECT …`）。
function lazy<T extends object>(pick: (c: Conn) => T): T {
  return new Proxy(function () {} as unknown as T, {
    get(_t, prop) {
      const self = pick(conn_()) as Record<PropertyKey, unknown>;
      const value = self[prop];
      return typeof value === "function" ? value.bind(self) : value;
    },
    has(_t, prop) {
      return prop in (pick(conn_()) as object);
    },
    apply(_t, thisArg, args) {
      const self = pick(conn_()) as unknown as (...a: unknown[]) => unknown;
      return Reflect.apply(self, thisArg, args);
    },
  });
}

export const client: Client = lazy((c) => c.sql);
export const db: Db = lazy((c) => c.db);
