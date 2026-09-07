import { RARITY_RANK, type Rarity } from "../fx/core";

// 卡片詳情的變動標記文字。純字串組裝，不碰 DOM，因此可在 node 環境下測試。
// 資料來源是 snapshot_stocks 的 prev_rarity / rarity_changed_on /
// direction_changed_on（見 lib/pool/snapshot.ts 的 resolveChangeMarks）。

// 與參考日同年只寫月日，跨年寫完整年月日。
// 只寫月日的話，一檔一年多沒變動的股票會分不出是哪一年。
export function fmtChangeDate(changedOn: string, refDate: string): string {
  return changedOn.slice(0, 4) === refDate.slice(0, 4)
    ? changedOn.slice(5)
    : changedOn;
}

// 「（09-07）自R卡降階」。沒有變動紀錄回 null，呼叫端不顯示這段。
export function rarityChangeMark(
  prevRarity: Rarity | null | undefined,
  rarity: Rarity,
  changedOn: string | null | undefined,
  refDate: string | null | undefined,
): string | null {
  if (!prevRarity || !changedOn || !refDate) return null;
  if (prevRarity === rarity) return null;
  const move = RARITY_RANK[rarity] > RARITY_RANK[prevRarity] ? "升階" : "降階";
  return `（${fmtChangeDate(changedOn, refDate)}）自${prevRarity}卡${move}`;
}

// 「（09-07）翻黑」／「（09-07）轉白」。沒有翻轉紀錄回 null。
// 方向決定卡片框體：DOWN 是黑邊暗卡，UP 用稀有度色描邊（見 StockCard.tsx）。
export function directionChangeMark(
  direction: "UP" | "DOWN",
  changedOn: string | null | undefined,
  refDate: string | null | undefined,
): string | null {
  if (!changedOn || !refDate) return null;
  const word = direction === "DOWN" ? "翻黑" : "轉白";
  return `（${fmtChangeDate(changedOn, refDate)}）${word}`;
}
