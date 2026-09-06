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
