import { getDb, batchAll } from "../db/client";
import { stockPrices, stocks } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import type { FetchDailyResult } from "../ingest/twse";

// 將單日全市場收盤資料入庫（僅存活躍股票），並以 LAG 重算 change1d
// 供 scripts/backfill 與 cron route 共用；不負責關閉連線
export async function storeDailyCloses(result: FetchDailyResult): Promise<number> {
  const db = await getDb();
  const active = await db
    .select({ stockCode: stocks.stockCode })
    .from(stocks)
    .where(eq(stocks.active, true));
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

  // D1 單查詢上限 100 個綁定參數：stock_prices 每列 4 欄 → 每批最多 24 列
  const statements = [];
  for (let i = 0; i < rows.length; i += 24) {
    statements.push(
      db
        .insert(stockPrices)
        .values(rows.slice(i, i + 24))
        .onConflictDoUpdate({
          target: [stockPrices.stockCode, stockPrices.date],
          set: { close: sql`excluded.close`, volume: sql`excluded.volume` },
        }),
    );
  }
  for (let i = 0; i < statements.length; i += 50) {
    await batchAll(statements.slice(i, i + 50));
  }

  await recomputeChange1d();
  return rows.length;
}

// 重算每日漲跌幅。SQLite（D1）支援 window function 與 UPDATE...FROM（3.33+），
// 語意與原 PostgreSQL 版相同：對全表以 LAG 取前日收盤後回寫。
export async function recomputeChange1d(): Promise<void> {
  const db = await getDb();
  await db.run(sql`
    WITH lagged AS (
      SELECT stock_code, date, close,
        LAG(close) OVER (PARTITION BY stock_code ORDER BY date) AS prev
      FROM stock_prices
    )
    UPDATE stock_prices AS sp
    SET change1d = ROUND((sp.close / l.prev - 1) * 100, 4)
    FROM lagged AS l
    WHERE l.stock_code = sp.stock_code AND l.date = sp.date
      AND l.prev IS NOT NULL AND l.prev > 0
  `);
}
