import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { catchUpDailyCloses } from "@/lib/ingest/catchup";
import { pricedDatesSince } from "@/lib/ingest/store";
import {
  generatePoolSnapshots,
  latestTradingDate,
  snapshotDatesSince,
} from "@/lib/pool/generate";
import { POOLS_CACHE_TAG } from "@/lib/pool/query";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 一次最多補幾個交易日。落後更多是該有人介入的狀況（跑 scripts/backfill
// 與 scripts/snapshot），不該讓 60 秒上限的 cron 硬扛而每次都逾時。
const MAX_CATCHUP_DAYS = 3;

// GET /api/cron/snapshot（Cloudflare Cron Trigger 或手動，帶 Bearer CRON_SECRET）
//
// 流程：補齊缺漏交易日的收盤 → 補齊缺漏的快照 → 生成最新快照。
//
// 為什麼是「補齊」而不是「抓最近一天」：Cron Triggers 是盡力而為，漏跑過
// （2026-09-11 整天沒觸發）。只抓最近一天的話，漏掉的日子不會自己回來，
// 而且會讓 change1d 算錯——它以 LAG 取資料表裡的前一列，中間缺一天就會把
// 多日漲跌當成單日。詳見 lib/ingest/catchup.ts。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const catchup = await catchUpDailyCloses({ maxDays: MAX_CATCHUP_DAYS });

    const snapshotDate = await latestTradingDate();
    if (!snapshotDate) {
      return NextResponse.json({ error: "無可用交易日資料" }, { status: 503 });
    }

    // 有收盤價卻沒有快照的日子，由舊到新補生成。
    // 變動標記是跟「前一個快照日」比對（見 lib/pool/generate.ts），跳過中間
    // 某一天會讓標記變成跨日比對，所以順序不能亂、也不能只補最新那天。
    const since = catchup.ingested[0] ?? snapshotDate;
    const priced = await pricedDatesSince(since);
    const snapped = new Set(await snapshotDatesSince(since));
    const missingSnapshots = priced
      .filter((d) => d !== snapshotDate && !snapped.has(d))
      .slice(0, MAX_CATCHUP_DAYS);
    for (const date of missingSnapshots) {
      await generatePoolSnapshots(date);
    }

    const summaries = await generatePoolSnapshots(snapshotDate);
    // 新快照生成後立即失效卡池快取，前台不必等 TTL 到期。
    // profile "max"＝stale-while-revalidate：讀取端永遠不會為了重算而卡住。
    revalidateTag(POOLS_CACHE_TAG, "max");

    if (catchup.reachedCap) {
      // 補課由舊往新填、收滿上限就停，所以還有更新的交易日沒補到。
      // 下一次 cron 會繼續往前推，但落後這麼多通常代表該有人介入。
      // observability 已開啟，這行會留在 Workers Logs（見 wrangler.jsonc 的註解）。
      console.warn(
        `[cron/snapshot] 補課達單次上限 ${MAX_CATCHUP_DAYS} 天，可能仍有較新的交易日未補；` +
          `下次 cron 會續補，要立刻追上請執行 npm run backfill 與 npm run snapshot`,
      );
    }

    return NextResponse.json({
      ingested: catchup.ingested,
      stored: catchup.stored,
      reachedCap: catchup.reachedCap,
      backfilledSnapshots: missingSnapshots,
      snapshotDate,
      pools: summaries,
    });
  } catch (err) {
    console.error("[cron/snapshot]", err);
    return NextResponse.json({ error: "快照生成失敗" }, { status: 500 });
  }
}
