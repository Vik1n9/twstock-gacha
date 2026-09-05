import { db } from "../db/client";
import { stockPrices, stocks } from "../db/schema";
import { sql } from "drizzle-orm";
import type { FetchDailyResult } from "../ingest/twse";

// 將單日全市場收盤資料入庫（僅存活躍股票），並以 LAG 重算 change1d
// 供 scripts/backfill 與 cron route 共用；不負責關閉連線
export async function storeDailyCloses(result: FetchDailyResult): Promise<number> {
  const active = await db
    .select({ stockCode: stocks.stockCode })
    .from(stocks)
    .where(sql`active = true`);
  const codes = new Set(active.map((s) => s.stockCode));

  const rows = result.rows
    .filter((r) => codes.has(r.stockCode))
    .map((r) => ({
      stockCode: r.stockCode,
      date: result.date,
      close: r.close,
      volume: r.volume,
    }));
  if (rows.length === 0) return 0;

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(stockPrices)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [stockPrices.stockCode, stockPrices.date],
        set: { close: sql`excluded.close`, volume: sql`excluded.volume` },
      });
  }

  await recomputeChange1d();
  return rows.length;
}

export async function recomputeChange1d(): Promise<void> {
  await db.execute(sql`
    WITH lagged AS (
      SELECT stock_code, date, close,
        LAG(close) OVER (PARTITION BY stock_code ORDER BY date) AS prev
      FROM stock_prices
    )
    UPDATE stock_prices sp
    SET change1d = ROUND(((sp.close / l.prev - 1) * 100)::numeric, 4)::double precision
    FROM lagged l
    WHERE l.stock_code = sp.stock_code AND l.date = sp.date
      AND l.prev IS NOT NULL AND l.prev > 0
  `);
}
