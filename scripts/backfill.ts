import { loadEnv } from "../lib/db/env";
import { fetchDailyClose } from "../lib/ingest/twse";

loadEnv();

// 回填近 N 個日曆天的收盤價（跳過週末），並計算 change1d
// 用法：npm run backfill [-- --days 60]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { db, client } = await import("../lib/db/client");
  const { stockPrices, stocks } = await import("../lib/db/schema");
  const { sql } = await import("drizzle-orm");

  const daysArgIdx = process.argv.indexOf("--days");
  const days =
    daysArgIdx !== -1 ? Number(process.argv[daysArgIdx + 1]) || 60 : 60;

  try {
    const active = await db
      .select({ stockCode: stocks.stockCode })
      .from(stocks)
      .where(sql`active = true`);
    const codes = new Set(active.map((s) => s.stockCode));
    console.log(`活躍股票：${codes.size} 檔，回填 ${days} 個日曆天`);

    const today = new Date();
    let inserted = 0;
    let tradingDays = 0;

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // 週末

      const ymd =
        `${d.getFullYear()}` +
        `${String(d.getMonth() + 1).padStart(2, "0")}` +
        `${String(d.getDate()).padStart(2, "0")}`;

      const result = await fetchDailyClose(ymd);
      if (!result || result.rows.length === 0) {
        console.log(`${ymd}：無資料（假日）`);
        continue;
      }

      const rows = result.rows
        .filter((r) => codes.has(r.stockCode))
        .map((r) => ({
          stockCode: r.stockCode,
          date: result.date,
          close: r.close,
          volume: r.volume,
        }));

      if (rows.length === 0) continue;

      for (let j = 0; j < rows.length; j += 500) {
        await db
          .insert(stockPrices)
          .values(rows.slice(j, j + 500))
          .onConflictDoNothing(); // 重跑安全
      }
      inserted += rows.length;
      tradingDays++;
      console.log(`${result.date}：${rows.length} 檔`);
      await sleep(400); // 節流，避免 TWSE 速率限制
    }

    // change1d：以 LAG 計算與前一個交易日之漲跌幅
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

    const [summary] = await db.execute<{ days: number; rows: number }>(sql`
      SELECT
        (SELECT count(DISTINCT date)::int FROM stock_prices) AS days,
        (SELECT count(*)::int FROM stock_prices) AS rows
    `);

    console.log(
      `回填完成：${tradingDays} 個交易日、本次寫入 ${inserted} 列；總計 ${summary.rows} 列 / ${summary.days} 日`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
