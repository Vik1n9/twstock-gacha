import type { SectorTheme } from "@/lib/sectors/defs";

// 前後端共用、不含 DB 依賴的 API 型別（客戶端元件可安全 import）

export interface PoolBoardInfo {
  tagId: string;
  tagName: string;
  description: string;
  theme: SectorTheme | null;
}

export interface PoolSnapshotInfo {
  snapshotDate: string;
  stockCount: number;
  upStockCount: number;
  downStockCount: number;
  board1dStrength: number | null;
  board30dStrength: number | null;
  isOpen: boolean;
  reason: string | null;
}

export interface PoolInfo {
  poolId: string;
  poolCode: string;
  poolName: string;
  poolType: string;
  board: PoolBoardInfo | null;
  snapshot: PoolSnapshotInfo | null;
  rarityCounts?: Record<string, { C: number; R: number; SR: number; SSR: number }>;
}

export interface DrawCard {
  stockCode: string;
  stockName: string;
  direction: "UP" | "DOWN";
  rolledRarity: "C" | "R" | "SR" | "SSR";
  rarity: "C" | "R" | "SR" | "SSR";
  close: number;
  change1d: number | null;
  change30d: number;
  boardName: string | null; // 該卡主板塊（板塊池＝池板塊；全市場池＝個股主板塊）
  // 變動標記（見 lib/pool/snapshot.ts）：null＝無紀錄，顯示端略過該段文字
  // 選填：此變更前存進 localStorage 的歷史紀錄（見 lib/history/store.ts）沒有這幾個欄位，讀回時是 undefined
  prevRarity?: "C" | "R" | "SR" | "SSR" | null;
  rarityChangedOn?: string | null;
  directionChangedOn?: string | null;
  // 跳變演出標記（純展示，不入抽卡紀錄、不影響機率）：
  // SR 結果 1/10 以「R」蓄力登場、SSR 結果 1/10 以「SR」蓄力登場
  jumpFrom?: "R" | "SR" | null;
}

export interface DrawOutcome {
  poolId: string;
  poolName: string;
  boardName: string | null;
  snapshotDate: string;
  stockCount: number;
  upStockCount: number;
  downStockCount: number;
  board30dStrength: number | null;
  cards: DrawCard[];
}

// 某一快照日的變動卡片（GET /api/snapshot）
export interface SnapshotChangeCard {
  stockCode: string;
  stockName: string;
  boardName: string | null; // 個股主板塊；無歸屬為 null
  direction: "UP" | "DOWN";
  rarity: "C" | "R" | "SR" | "SSR";
  prevRarity: "C" | "R" | "SR" | "SSR" | null; // 上一個不同的稀有度
  close: number;
  change1d: number | null;
  change30d: number;
  // 變動標記日期沿用 DrawCard 的語意與欄位名，卡面／卡片詳情可直接吃這個物件。
  // 「這一天變動」＝日期等於 snapshotDate；清單只收兩者其一等於快照日的卡。
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
  rarityMove: "up" | "down" | null; // 當天升／降階；prevRarity 為 null 時判不出
}

export interface SnapshotChanges {
  snapshotDate: string;
  stockCount: number; // 全市場池當日檔數
  upStockCount: number;
  downStockCount: number;
  rarityChangedCount: number;
  directionChangedCount: number;
  cards: SnapshotChangeCard[];
}
