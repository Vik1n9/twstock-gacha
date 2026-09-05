import { loadEnv } from "../lib/db/env";
import { fetchDailyClose } from "../lib/ingest/twse";
import { storeDailyCloses } from "../lib/ingest/store";

loadEnv();

// 回填近 N 個日曆天的收盤價（跳過週末），逐日入庫並重算 change1d
// 用法：npm run backfill [-- --days 60]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { client } = await import("../lib/db/client");

  const daysArgIdx = process.argv.indexOf("--days");
  const days =
    daysArgIdx !== -1 ? Number(process.argv[daysArgIdx + 1]) || 60 : 60;

  try {
    console.log(`回填 ${days} 個日曆天`);

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

      const n = await storeDailyCloses(result);
      inserted += n;
      tradingDays++;
      console.log(`${result.date}：${n} 檔`);
      await sleep(400); // 節流，避免 TWSE 速率限制
    }

    console.log(`回填完成：${tradingDays} 個交易日、本次寫入 ${inserted} 列`);
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
