import { NextResponse } from "next/server";
import { findLastTradingDay } from "@/lib/ingest/twse";
import { storeDailyCloses } from "@/lib/ingest/store";
import {
  generatePoolSnapshots,
  latestTradingDate,
} from "@/lib/pool/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/snapshot（Vercel Cron 或手動，帶 Bearer CRON_SECRET）
// 流程＝企劃書 5.1：抓最近交易日收盤 → 入庫 → 生成快照
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const daily = await findLastTradingDay();
    let stored = 0;
    let date: string | null = null;
    if (daily) {
      stored = await storeDailyCloses(daily);
      date = daily.date;
    }

    const snapshotDate = (await latestTradingDate()) ?? date;
    if (!snapshotDate) {
      return NextResponse.json(
        { error: "無可用交易日資料" },
        { status: 503 },
      );
    }

    const summaries = await generatePoolSnapshots(snapshotDate);
    return NextResponse.json({
      ingestedDate: date,
      stored,
      snapshotDate,
      pools: summaries,
    });
  } catch (err) {
    console.error("[cron/snapshot]", err);
    return NextResponse.json({ error: "快照生成失敗" }, { status: 500 });
  }
}
