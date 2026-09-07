import { classifyChange, type Direction, type Rarity } from "../gacha/rarity";
import { median } from "./stats";

export interface StockMetrics {
  direction: Direction;
  rarity: Rarity;
  change30d: number;
  change1d: number | null;
  close: number; // 快照日收盤價（卡片顯示用，企劃書 11.1）
}

// YYYY-MM-DD 加減日曆天。以 UTC 解析，避免本機時區把日期推移一天。
export function shiftDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// 30 日視窗以「日曆日」計，不是交易日：玩家講 30 天想的是日曆天。
// 交易日版本會讓「一個月」實際橫跨約 42 個日曆日，跟卡面寫的對不起來。
const WINDOW_DAYS = 30;

// 計算單一股票於快照日的稀有度與漲跌幅
// closesDesc：該股票的收盤，由快照日往回排序（index 0 = 快照日）
// 企劃書 5.2：須有快照日收盤價，且 30 個日曆日前有可用的基準收盤價
export function computeStockMetrics(
  closesDesc: { date: string; close: number }[],
): StockMetrics | null {
  const latest = closesDesc[0];
  if (!latest || !Number.isFinite(latest.close) || latest.close <= 0) {
    return null;
  }

  // 第 30 個日曆日當天若逢週末或連假就沒有收盤，往前退到最近一個有收盤的
  // 交易日（序列已由新到舊排序，第一個落在界線內的就是它）。
  const cutoff = shiftDays(latest.date, -WINDOW_DAYS);
  const base = closesDesc.find((r) => r.date <= cutoff);
  // 找不到＝這一檔的資料跨不過 30 個日曆日（新上市或價格視窗不足），
  // 回 null 讓呼叫端把它排除在卡池外
  if (!base || !Number.isFinite(base.close) || base.close <= 0) return null;

  const change30d = (latest.close / base.close - 1) * 100;
  const { direction, rarity } = classifyChange(change30d);

  // 昨日漲跌看的是「前一個交易日」，與 30 日視窗的日曆日基準無關
  let change1d: number | null = null;
  const prev = closesDesc[1];
  if (prev && Number.isFinite(prev.close) && prev.close > 0) {
    change1d = (latest.close / prev.close - 1) * 100;
  }

  return { direction, rarity, change30d, change1d, close: latest.close };
}

// 卡片變動標記：稀有度升降與方向翻轉各自獨立計日。
// 逐日沿用而非回頭重算——狀態相同就繼承前一個快照日的值，不同才寫入今天。
// 前值為 null 代表「不知道何時開始」（這一檔在有這個欄位之前就已是這個狀態），
// 顯示端會略過該段文字。
export interface ChangeMarks {
  prevRarity: Rarity | null;
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
}

export interface PrevMarkRow extends ChangeMarks {
  direction: Direction;
  rarity: Rarity;
}

export function resolveChangeMarks(
  prev: PrevMarkRow | undefined,
  current: { direction: Direction; rarity: Rarity },
  snapshotDate: string,
): ChangeMarks {
  if (!prev) {
    return { prevRarity: null, rarityChangedOn: null, directionChangedOn: null };
  }
  const rarityChanged = prev.rarity !== current.rarity;
  const directionChanged = prev.direction !== current.direction;
  return {
    prevRarity: rarityChanged ? prev.rarity : prev.prevRarity,
    rarityChangedOn: rarityChanged ? snapshotDate : prev.rarityChangedOn,
    directionChangedOn: directionChanged
      ? snapshotDate
      : prev.directionChangedOn,
  };
}

export interface PoolGateResult {
  isOpen: boolean;
  reason: string | null;
  stockCount: number;
  upStockCount: number;
  downStockCount: number;
  board1dStrength: number | null;
  board30dStrength: number | null;
}

// 快照統計（企劃書 5.1 步驟 6）
// 開放政策：所有卡池常態開放、無活動週期鎖定；單方向池開放（企劃書 5.4 方案B），
// 方向機率即反映實際分布（全漲＝100% 上漲）。isOpen 恆 true，reason 恆 null。
export function gatePool(metrics: StockMetrics[]): PoolGateResult {
  const stockCount = metrics.length;
  const upStockCount = metrics.filter((m) => m.direction === "UP").length;
  const downStockCount = stockCount - upStockCount;

  const board1dStrength = median(
    metrics.map((m) => m.change1d).filter((v): v is number => v !== null),
  );
  const board30dStrength = median(metrics.map((m) => m.change30d));

  return {
    isOpen: true,
    reason: null,
    stockCount,
    upStockCount,
    downStockCount,
    board1dStrength,
    board30dStrength,
  };
}
