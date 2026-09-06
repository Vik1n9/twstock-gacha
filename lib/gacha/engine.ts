import {
  RARITY_TARGETS,
  downgradeRarity,
  type Direction,
  type Rarity,
} from "./rarity";

export const RARITY_LIST: Rarity[] = ["C", "R", "SR", "SSR"];

// 企劃書 16.5/17：池內候選股票，按 (方向, 稀有度) 分桶
export interface PoolBucket {
  stockCode: string;
  weight: number;
}

export interface PoolState {
  upStockCount: number;
  downStockCount: number;
  // 全市場池固定 50/50（企劃書 9.1）；板塊池 null＝依池內實際分布動態計算（9.2）
  fixedUpRate: number | null;
  buckets: Map<string, PoolBucket[]>; // key: `${direction}:${rarity}`
}

export interface DrawResult {
  stockCode: string;
  direction: Direction;
  rolledRarity: Rarity; // 隨機抽中（降級前，供機率驗證）
  finalRarity: Rarity; // 空池降級後
}

function bucketKey(direction: Direction, rarity: Rarity): string {
  return `${direction}:${rarity}`;
}

export function buildPoolState(
  rows: { stockCode: string; direction: string; rarity: string; weight: number }[],
  fixedUpRate: number | null = null,
): PoolState {
  const up = rows.filter((r) => r.direction === "UP").length;
  const down = rows.length - up;
  const buckets = new Map<string, PoolBucket[]>();
  for (const r of rows) {
    const key = bucketKey(r.direction as Direction, r.rarity as Rarity);
    const list = buckets.get(key);
    if (list) list.push({ stockCode: r.stockCode, weight: r.weight });
    else buckets.set(key, [{ stockCode: r.stockCode, weight: r.weight }]);
  }
  return { upStockCount: up, downStockCount: down, fixedUpRate, buckets };
}

function rollDirection(pool: PoolState, rng: () => number): Direction | null {
  const total = pool.upStockCount + pool.downStockCount;
  if (total <= 0) return null; // 企劃書 10.3：方向空池為資料異常
  const upRate =
    pool.fixedUpRate ?? pool.upStockCount / total; // 企劃書 9.1/9.2
  return rng() < upRate ? "UP" : "DOWN";
}

function rollRarity(rng: () => number): Rarity {
  let cum = 0;
  const r = rng();
  for (const rarity of RARITY_LIST) {
    cum += RARITY_TARGETS[rarity]; // 企劃書 9.4 目標機率
    if (r < cum) return rarity;
  }
  return "C"; // 浮點誤差保底
}

function pickWeighted(candidates: PoolBucket[], rng: () => number): string {
  if (candidates.length === 1) return candidates[0].stockCode;
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r < 0) return c.stockCode;
  }
  return candidates[candidates.length - 1].stockCode;
}

// 企劃書 17.1 板塊池抽卡偽代碼
// 回 null：方向空池（資料異常，呼叫端應記錄並重抽或回錯，企劃書 10.3）
export function drawOnce(
  pool: PoolState,
  rng: () => number = Math.random,
): DrawResult | null {
  const direction = rollDirection(pool, rng);
  if (!direction) return null;

  let rarity = rollRarity(rng);
  const rolledRarity = rarity;

  // 企劃書 10.2：維持原方向，稀有度逐級下降直到有股票
  for (;;) {
    const candidates = pool.buckets.get(bucketKey(direction, rarity));
    if (candidates && candidates.length > 0) {
      return {
        stockCode: pickWeighted(candidates, rng),
        direction,
        rolledRarity,
        finalRarity: rarity,
      };
    }
    const lower = downgradeRarity(rarity);
    if (!lower) return null; // 連 C 都空 → 資料異常
    rarity = lower;
  }
}
