import { classifyChange, type Direction, type Rarity } from "../gacha/rarity";
import { median } from "./stats";

export interface StockMetrics {
  direction: Direction;
  rarity: Rarity;
  change30d: number;
  change1d: number | null;
  close: number; // 快照日收盤價（卡片顯示用，企劃書 11.1）
}

// 計算單一股票於快照日的稀有度與漲跌幅
// closesDesc：該股票收盤價，由快照日往回（index 0 = 快照日）
// 企劃書 5.2：須有快照日收盤價且可計算 30 個交易日漲跌幅（共 31 列）
export function computeStockMetrics(
  closesDesc: number[],
): StockMetrics | null {
  if (closesDesc.length < 31) return null; // 30 日視窗不足
  const latest = closesDesc[0];
  if (!Number.isFinite(latest) || latest <= 0) return null;

  const base = closesDesc[30];
  if (!Number.isFinite(base) || base <= 0) return null;

  const change30d = (latest / base - 1) * 100;
  const { direction, rarity } = classifyChange(change30d);

  let change1d: number | null = null;
  const prev = closesDesc[1];
  if (Number.isFinite(prev) && prev > 0) {
    change1d = (latest / prev - 1) * 100;
  }

  return { direction, rarity, change30d, change1d, close: latest };
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
