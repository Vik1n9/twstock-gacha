import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./lib/db/env";

loadEnv();

// D1（d1-http driver）：db:push 直接對遠端 D1 校正 schema。
// 本機 dev 的 D1 由 wrangler 模擬，schema 用以下方式套用：
//   npx wrangler d1 execute twstock-gacha --local --file ./drizzle/<migration>.sql
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  },
});
