import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { loadEnv } from "./env";

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("缺少 DATABASE_URL，請設定 .env.local（見 .env.example）");
}

// max=1：Vercel serverless 每實例單連線，避免耗盡 Neon 免費額度
export const client = postgres(url, { max: 1, idle_timeout: 20 });

export const db = drizzle(client, { schema });
export type Db = typeof db;
