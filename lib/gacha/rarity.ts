// 企劃書 1.2 稀有度判定：過去 30 個日曆日漲跌幅
// 上漲卡門檻 0~<5 C、5~<15 R、15~<30 SR、≥30 SSR；下跌卡取絕對值同門檻
// 恰為 0% 歸上漲 C（「0%～未滿5%」含 0）

export type Direction = "UP" | "DOWN";
export type Rarity = "C" | "R" | "SR" | "SSR";

export const RARITY_TARGETS: Record<Rarity, number> = {
  C: 0.8,
  R: 0.15,
  SR: 0.04,
  SSR: 0.01,
};

// 空池降級順序（企劃書 10.2）：SSR→SR→R→C
export const RARITY_DOWNGRADE: Record<Exclude<Rarity, "C">, Rarity> = {
  SSR: "SR",
  SR: "R",
  R: "C",
};

export function classifyChange(change30d: number): {
  direction: Direction;
  rarity: Rarity;
} {
  const direction: Direction = change30d >= 0 ? "UP" : "DOWN";
  const abs = Math.abs(change30d);
  const rarity: Rarity =
    abs >= 30 ? "SSR" : abs >= 15 ? "SR" : abs >= 5 ? "R" : "C";
  return { direction, rarity };
}

// 降一級；C 無法再降，回 null（呼叫端應確認此為資料異常路徑）
export function downgradeRarity(r: Rarity): Rarity | null {
  if (r === "C") return null;
  return RARITY_DOWNGRADE[r];
}
