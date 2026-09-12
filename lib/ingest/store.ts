import { getDb, batchAll } from "../db/client";
import { stockPrices, stocks } from "../db/schema";
import { eq, gte, sql } from "drizzle-orm";
import type { FetchDailyResult } from "../ingest/twse";

export interface StoreOptions {
  /** 該日已完整入庫時仍重寫（校正用）。預設 false：已入庫就跳過。 */
  force?: boolean;
  /** 入庫後是否重算該日 change1d。預設 true；backfill 逐日跑時關掉，最後統一算一次。 */
  recompute?: boolean;
}

// 將單日全市場收盤資料入庫（僅存活躍股票），並重算「該日」的 change1d。
// 供 scripts/backfill 與 cron route 共用；不負責關閉連線
export async function storeDailyCloses(
  result: FetchDailyResult,
  opts: StoreOptions = {},
): Promise<number> {
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

  // 該日已完整入庫就不重寫：收盤價是定案值，重抓只是白白消耗 D1 的每日寫入配額
  // （cron 的補課會重複探測視窗內的日子，同一天很容易被送進來第二次）。
  // 用「已存列數 < 應寫列數」判斷，先前批次寫到一半失敗的情況仍會補齊。
  // 需要校正時以 npm run recompute 或 --force 明確處理，不放進每日排程。
  if (!opts.force) {
    const [existing] = await db
      .select({ n: sql<number>`count(*)` })
      .from(stockPrices)
      .where(eq(stockPrices.date, result.date));
    if ((existing?.n ?? 0) >= rows.length) return 0;
  }

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

  if (opts.recompute !== false) {
    await recomputeChange1d({ from: result.date, to: result.date });
  }
  return rows.length;
}

export interface RecomputeRange {
  /** 起日（含）。省略＝不設下界。 */
  from?: string;
  /** 迄日（含）。省略＝不設上界。 */
  to?: string;
}

// LAG 需要看到目標區間之前的一個交易日；30 個日曆日足以跨過農曆年連假。
const LAG_LOOKBACK_DAYS = 30;
const DATE_MIN = "0000-01-01";
const DATE_MAX = "9999-12-31";

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 重算 change1d。SQLite（D1）支援 window function 與 UPDATE...FROM（3.33+），
// 語意與原 PostgreSQL 版相同：以 LAG 取前一交易日收盤後回寫。
//
// 寫入範圍必須限縮：這支原本是無界的全表 UPDATE，且被放在 storeDailyCloses 裡
// 每匯入一天就跑一次。前一天的 change1d 在前一天就算過了，重算整張表純屬浪費，
// 而它正是 D1「每日寫入 100,000 列」配額的主要消耗來源
// （1076 檔 × 60 天 ≈ 64,000 列／天，且隨歷史無上限成長；
//  backfill 60 天更是 60 次全表重寫 ≈ 200 萬列）。
//
// CTE 的讀取範圍會往前多抓 LAG_LOOKBACK_DAYS 天以取得前一交易日的收盤，
// 但實際被寫入的列仍嚴格限定在 [from, to]。
export async function recomputeChange1d(
  range: RecomputeRange = {},
): Promise<void> {
  const db = await getDb();
  const from = range.from ?? DATE_MIN;
  const to = range.to ?? DATE_MAX;
  const readFrom = range.from ? shiftDays(range.from, -LAG_LOOKBACK_DAYS) : DATE_MIN;

  await db.run(sql`
    WITH lagged AS (
      SELECT stock_code, date, close,
        LAG(close) OVER (PARTITION BY stock_code ORDER BY date) AS prev
      FROM stock_prices
      WHERE date >= ${readFrom} AND date <= ${to}
    )
    UPDATE stock_prices AS sp
    SET change1d = ROUND((sp.close / l.prev - 1) * 100, 4)
    FROM lagged AS l
    WHERE l.stock_code = sp.stock_code AND l.date = sp.date
      AND l.prev IS NOT NULL AND l.prev > 0
      AND sp.date >= ${from} AND sp.date <= ${to}
  `);
}

// 目前資料庫中最早／最晚的收盤日，供 recompute 腳本在未指定範圍時取用
export async function priceDateRange(): Promise<{ from: string; to: string } | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      from: sql<string | null>`min(date)`,
      to: sql<string | null>`max(date)`,
    })
    .from(stockPrices);
  if (!row?.from || !row?.to) return null;
  return { from: row.from, to: row.to };
}

// 指定日期（含）之後、stock_prices 已有資料的交易日，由舊到新。
// 供 cron 補課判斷「哪幾天還沒入庫」；下界由呼叫端給，查詢量不隨歷史成長。
export async function pricedDatesSince(since: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ date: stockPrices.date })
    .from(stockPrices)
    .where(gte(stockPrices.date, since))
    .orderBy(stockPrices.date);
  return rows.map((r) => r.date);
}
