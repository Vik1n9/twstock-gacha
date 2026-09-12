import { loadEnv } from "../lib/db/env";
import { argOf, hasFlag } from "../lib/cli/args";

loadEnv();

// 用法：npm run snapshot [-- --date YYYY-MM-DD]
// 未指定日期時使用資料庫最近交易日
async function main() {
  const { generatePoolSnapshots, latestTradingDate } = await import(
    "../lib/pool/generate"
  );

  // 帶了 --date 卻沒給值就直接報錯，不要無聲改用最近交易日：
  // 使用者明確指定了日期，靜默換一個日期會讓人以為快照生成在自己指定的那天。
  const dateArg = argOf("--date");
  if (hasFlag("--date") && !dateArg) {
    throw new Error("--date 需要一個日期，格式 YYYY-MM-DD");
  }
  const date = dateArg ?? (await latestTradingDate());
  if (!date) throw new Error("無可用交易日資料，請先執行 backfill");

  try {
    const summaries = await generatePoolSnapshots(date);
    for (const s of summaries) {
      console.log(
        [
          `池：${s.poolId}`,
          `快照日：${s.snapshotDate}`,
          `可抽：${s.stockCount}`,
          `漲/跌：${s.upStockCount}/${s.downStockCount}`,
          `昨日強度：${s.board1dStrength?.toFixed(2) ?? "-"}%`,
          `30日強度：${s.board30dStrength?.toFixed(2) ?? "-"}%`,
          s.isOpen ? "開放" : `隱藏（${s.reason}）`,
        ].join("　|　"),
      );
    }
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
