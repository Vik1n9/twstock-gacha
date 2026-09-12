import { loadEnv } from "../lib/db/env";
import { argOf } from "../lib/cli/args";

loadEnv();

// 手動重算 change1d（資料校正用，不在每日排程內）
// 用法：
//   npm run recompute                                   # 全部日期
//   npm run recompute -- --from 2026-08-01              # 指定起日之後
//   npm run recompute -- --from 2026-08-01 --to 2026-09-04
//
// 每日 cron 只會重算「當日」那一天（見 lib/ingest/store.ts）。
// 需要回頭修正歷史資料時才跑這支——它的寫入量與指定區間成正比，
// 全表重算約等於「檔數 × 交易日數」列，請留意 D1 的每日寫入配額。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const { recomputeChange1d, priceDateRange } = await import(
    "../lib/ingest/store"
  );

  const from = argOf("--from");
  const to = argOf("--to");
  for (const [flag, value] of [
    ["--from", from],
    ["--to", to],
  ] as const) {
    if (value !== undefined && !DATE_RE.test(value)) {
      throw new Error(`${flag} 格式須為 YYYY-MM-DD，收到「${value}」`);
    }
  }
  if (from && to && from > to) {
    throw new Error(`--from（${from}）不可晚於 --to（${to}）`);
  }

  const range = await priceDateRange();
  if (!range) {
    console.log("stock_prices 無資料，無須重算");
    return;
  }

  const effFrom = from ?? range.from;
  const effTo = to ?? range.to;
  console.log(`重算 change1d：${effFrom} ~ ${effTo}（資料庫現有 ${range.from} ~ ${range.to}）`);

  await recomputeChange1d({ from, to });
  console.log("完成");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
