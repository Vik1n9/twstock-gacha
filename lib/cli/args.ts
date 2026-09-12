// scripts/ 共用的命令列參數解析。
//
// 為何要「取最後一個」而非第一個：npm scripts 會把預設參數寫死在 package.json，
// 例如 "backfill": "tsx scripts/backfill.ts --days 60"。使用者以
// `npm run backfill -- --days 4` 覆寫時，argv 會變成 [..., "--days", "60", "--days", "4"]，
// 追加的值排在後面。用 indexOf 取第一個匹配等於永遠讀到寫死的預設值，
// 使用者傳什麼都沒有效果——而且是安靜地沒有效果，沒有任何錯誤訊息。
//
// 這不只是跑得比較久：backfill 的回填天數決定 recomputeChange1d 的重算區間，
// 60 天 ≈ 46,000 列寫入 vs 4 天 ≈ 2,200 列，D1 免費方案每日上限是 100,000 列。

/** 取 `--name value` 形式的值。同名旗標出現多次時取最後一個（後蓋前）。 */
export function argOf(name: string, argv: string[] = process.argv): string | undefined {
  const i = argv.lastIndexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
}

/** 取 `--name` 形式的布林旗標。 */
export function hasFlag(name: string, argv: string[] = process.argv): boolean {
  return argv.includes(name);
}

/** 取數值型旗標；缺少、非數字或 0 時回傳 fallback。 */
export function numberArg(
  name: string,
  fallback: number,
  argv: string[] = process.argv,
): number {
  return Number(argOf(name, argv)) || fallback;
}
