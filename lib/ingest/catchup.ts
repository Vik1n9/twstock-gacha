import { fetchDailyClose, ymdOf, type FetchDailyResult } from "./twse";
import { storeDailyCloses, recomputeChange1d, pricedDatesSince } from "./store";

// 收盤資料的「補課」機制：不假設每個交易日的 cron 都有跑到。
//
// 為什麼需要：Cloudflare Cron Triggers 是盡力而為，官方不保證準時、也不保證
// 必定執行。2026-09-11 就真的整個沒觸發（Workers Logs 在 100% 取樣下零筆
// scheduled），資料停在 09-10 直到人工補。原本的 cron 只抓「最近一個交易日」，
// 漏掉的那幾天不會自己回來。
//
// 更麻煩的是 change1d：recomputeChange1d 以 LAG 取「資料表裡前一列」，
// 若 09-11 缺著讓 09-14 先入庫，09-14 的 change1d 會變成 09-10→09-14 的
// 四日漲跌，而且事後補 09-11 也不會自動修正 09-14。所以補課必須「由舊到新
// 入庫、最後對整段重算一次」，而不是只補最新那天。
//
// 因此這裡偵測的是「洞」而不是只有尾端落差：先讀出視窗內已入庫的交易日，
// candidate 只要不在其中就探測。若只用「往回走到第一個已入庫的日期就停」，
// 週一 cron 先把 09-14 寫進去之後，09-11 這個洞就永遠補不到了。

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YYYYMMDD → YYYY-MM-DD */
export function isoOf(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 列出要探測的日曆日（YYYYMMDD），由舊到新，跳過週末。
 * 跳週末純粹是省 TWSE 請求；假日仍會被探測到（TWSE 回 null），無法預先得知。
 */
export function candidateDates(today: Date, lookbackDays: number): string[] {
  const out: string[] = [];
  for (let i = lookbackDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    out.push(ymdOf(d));
  }
  return out;
}

export interface CollectOptions {
  /** 要探測的日曆日，由舊到新（candidateDates 的輸出）。 */
  candidates: string[];
  /** 已入庫的交易日（YYYY-MM-DD）。 */
  stored: Set<string>;
  /** 最多收集幾個交易日。 */
  maxDays: number;
  fetchDay: (ymd: string) => Promise<FetchDailyResult | null>;
  /** 每次 TWSE 請求之間的間隔毫秒。 */
  throttleMs?: number;
}

export interface CollectResult {
  /** 待入庫的交易日資料，由舊到新。 */
  days: FetchDailyResult[];
  /** 收滿 maxDays 而提前停止：視窗內可能還有更新的缺漏要等下一次補。 */
  reachedCap: boolean;
}

/**
 * 探測 TWSE，挑出「有資料但還沒入庫」的交易日。
 *
 * 由舊往新收，收滿 maxDays 就停——不是先補最新的那幾天。因為 change1d 以
 * LAG 取資料表裡的前一列：若先補最新三天、把更舊的洞留著，最舊那天補進來的
 * change1d 會跨過那個洞算成多日漲跌，而且下一次補課的重算區間不會涵蓋它，
 * 錯誤會就這樣留著。由舊往新填則每一段都接在已有資料後面，永遠是對的，
 * 代價只是落後超過上限時要多跑幾次 cron 才追上（那本來就該有人介入）。
 *
 * fetchDay 做成參數是為了讓這段邏輯（洞偵測、上限、排序）可以單獨測試，
 * 不必真的打 TWSE。
 */
export async function collectMissingDays({
  candidates,
  stored,
  maxDays,
  fetchDay,
  throttleMs = 500,
}: CollectOptions): Promise<CollectResult> {
  const days: FetchDailyResult[] = [];
  let reachedCap = false;

  for (const ymd of candidates) {
    if (stored.has(isoOf(ymd))) continue; // 已入庫；continue 而非 break——中間可能有洞
    if (days.length >= maxDays) {
      reachedCap = true;
      break;
    }
    const result = await fetchDay(ymd);
    if (result && result.rows.length > 0) days.push(result);
    if (throttleMs > 0) await sleep(throttleMs);
  }

  return { days, reachedCap };
}

export interface CatchUpOptions {
  /** 最多補幾個交易日。預設 3——落後更多是該有人介入的狀況，不該讓 60 秒的 cron 硬扛。 */
  maxDays?: number;
  /** 往回探測幾個日曆日。預設 10（約兩週的平日，足以跨過一般連假）。 */
  lookbackDays?: number;
  throttleMs?: number;
  now?: Date;
}

export interface CatchUpResult {
  /** 這次新入庫的交易日，由舊到新。 */
  ingested: string[];
  /** 新入庫的總列數。 */
  stored: number;
  /** 收滿上限而提前停止：還有更新的缺漏要等下一次補。 */
  reachedCap: boolean;
}

/** 補齊視窗內缺漏的交易日收盤價，並對補進來的區間重算一次 change1d。 */
export async function catchUpDailyCloses(
  opts: CatchUpOptions = {},
): Promise<CatchUpResult> {
  const maxDays = opts.maxDays ?? 3;
  const lookbackDays = opts.lookbackDays ?? 10;
  const now = opts.now ?? new Date();

  const candidates = candidateDates(now, lookbackDays);
  // 視窗下界取最舊的 candidate，查詢範圍不會隨歷史成長
  const since = isoOf(candidates[0] ?? ymdOf(now));
  const stored = new Set(await pricedDatesSince(since));

  const { days, reachedCap } = await collectMissingDays({
    candidates,
    stored,
    maxDays,
    fetchDay: fetchDailyClose,
    throttleMs: opts.throttleMs,
  });

  let rows = 0;
  for (const day of days) {
    // recompute: false → 逐日不重算，整段入庫後統一算一次（理由同 scripts/backfill.ts）
    rows += await storeDailyCloses(day, { recompute: false });
  }
  if (days.length > 0) {
    await recomputeChange1d({
      from: days[0].date,
      to: days[days.length - 1].date,
    });
  }

  return { ingested: days.map((d) => d.date), stored: rows, reachedCap };
}
