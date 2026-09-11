import { loadEnv } from "../lib/db/env";
import { readFileSync } from "node:fs";
import { join } from "node:path";

loadEnv();

// 用法：npm run check:cron
// 比對「wrangler.jsonc 設定的 cron」與「Cloudflare 上這個 Worker 實際掛著的 cron」。
//
// 為何需要這支：部署過程中 triggers 只要沒被送上去（或被 dashboard 改掉），
// 線上就會安靜地少掉排程——Worker 照常回應 fetch，只是 scheduled 永遠不會被叫，
// 快照就停在前一個交易日。這種狀況從 repo 完全看不出來，只能問 Cloudflare API。
//
// 需要一組有 Workers Scripts:Read 權限的 API token（D1 Edit 的 token 不夠，會回 403）。

type Schedule = { cron: string };
type ApiResponse = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: Schedule[];
};

// wrangler.jsonc 的註解都是整行 //，去掉後就是合法 JSON
function readConfiguredCrons(): { name: string; crons: string[] } {
  const raw = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
  const stripped = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const config = JSON.parse(stripped) as {
    name: string;
    triggers?: { crons?: string[] };
  };
  return { name: config.name, crons: config.triggers?.crons ?? [] };
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      "缺少 CLOUDFLARE_ACCOUNT_ID／CLOUDFLARE_API_TOKEN（放在 .env.local）",
    );
  }

  const { name, crons: configured } = readConfiguredCrons();

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}/schedules`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body = (await res.json()) as ApiResponse;

  if (!res.ok || !body.success) {
    const detail =
      body.errors?.map((e) => `${e.code} ${e.message}`).join("；") ??
      `HTTP ${res.status}`;
    if (res.status === 403) {
      throw new Error(
        `讀取排程被拒（${detail}）。token 需要 Workers Scripts:Read 權限，` +
          `只給 D1 Edit 是不夠的。`,
      );
    }
    throw new Error(`讀取排程失敗：${detail}`);
  }

  const deployed = (body.result ?? []).map((s) => s.cron);

  console.log(`Worker：${name}`);
  console.log(`設定（wrangler.jsonc）：${configured.join("、") || "（無）"}`);
  console.log(`線上（Cloudflare）：${deployed.join("、") || "（無）"}`);

  const missing = configured.filter((c) => !deployed.includes(c));
  const extra = deployed.filter((c) => !configured.includes(c));

  if (missing.length === 0 && extra.length === 0) {
    console.log("一致 ✓");
    return;
  }
  if (missing.length) console.error(`線上少了：${missing.join("、")}`);
  if (extra.length) console.error(`線上多了：${extra.join("、")}`);
  console.error("重新部署（npm run deploy）可把設定推回線上。");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
