import { loadEnv } from "../lib/db/env";
import { hasFlag, numberArg } from "../lib/cli/args";
import { fetchDailyClose } from "../lib/ingest/twse";
import { storeDailyCloses, recomputeChange1d } from "../lib/ingest/store";

loadEnv();

// 回填近 N 個日曆天的收盤價（跳過週末），逐日入庫，最後統一重算 change1d
// 用法：npm run backfill [-- --days 60] [--force]
//
// 為何最後才算 change1d：本迴圈是「由新到舊」跑，處理第 D 天時第 D-1 天還沒入庫，
// 當下算不出 D 的漲跌幅。過去的作法是每天都重算整張表（60 天 ≈ 200 萬列寫入，
// 遠超過 D1 免費方案每日 100,000 列），改為全部入庫後對回填區間算一次。

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const days = numberArg("--days", 60);
  const force = hasFlag("--force");

  console.log(`回填 ${days} 個日曆天`);

  const today = new Date();
  let inserted = 0;
  let tradingDays = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

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

    // recompute: false → 逐日不重算，統一於迴圈結束後對整段區間算一次
    const n = await storeDailyCloses(result, { force, recompute: false });
    inserted += n;
    tradingDays++;
    if (!earliest || result.date < earliest) earliest = result.date;
    if (!latest || result.date > latest) latest = result.date;
    console.log(`${result.date}：${n === 0 ? "已入庫，跳過" : `${n} 檔`}`);
    await sleep(400); // 節流，避免 TWSE 速率限制
  }

  if (earliest && latest) {
    console.log(`重算 change1d：${earliest} ~ ${latest}`);
    await recomputeChange1d({ from: earliest, to: latest });
  }

  console.log(`回填完成：${tradingDays} 個交易日、本次寫入 ${inserted} 列`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
