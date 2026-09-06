"use client";

import { useSyncExternalStore } from "react";
import type { DrawCard, DrawOutcome } from "@/lib/api/types";

// 抽卡紀錄：alpha 無帳號系統，紀錄存在瀏覽器 localStorage（單一裝置、單一瀏覽器）
// DB 的 draw_records 是全站機率驗證用、不分玩家，故不拿來當個人紀錄來源。
const KEY = "twstock-history";
const LIMIT = 600; // 上限，超過丟最舊的

export type DrawType = "single" | "ten";

export interface HistoryEntry extends DrawCard {
  id: string;
  drawnAt: number; // epoch ms
  poolId: string;
  poolName: string;
  boardName: string | null;
  snapshotDate: string;
  drawType: DrawType;
}

const EMPTY: HistoryEntry[] = [];
const listeners = new Set<() => void>();

let cache: HistoryEntry[] = EMPTY;
let initialized = false;

function readStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    // 舊格式或壞資料直接濾掉，避免整份紀錄失效
    return parsed.filter(
      (e): e is HistoryEntry =>
        !!e && typeof e === "object" && typeof (e as HistoryEntry).stockCode === "string",
    );
  } catch {
    return EMPTY;
  }
}

function ensureInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  cache = readStorage();
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 配額滿或隱私模式：紀錄功能降級，不影響抽卡
  }
}

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  ensureInit();
  listeners.add(listener);
  // 同一瀏覽器多分頁同步
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = readStorage();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): HistoryEntry[] {
  ensureInit();
  return cache;
}

function getServerSnapshot(): HistoryEntry[] {
  return EMPTY;
}

/** 把一次抽卡結果寫進紀錄（最新的排最前面）；boardName 為該卡主板塊（企劃書 11） */
export function appendOutcome(outcome: DrawOutcome, drawType: DrawType): void {
  ensureInit();
  if (typeof window === "undefined") return;
  const now = Date.now();
  const batch: HistoryEntry[] = outcome.cards.map((card, i) => ({
    ...card,
    id: `${now}-${i}-${card.stockCode}`,
    drawnAt: now,
    poolId: outcome.poolId,
    poolName: outcome.poolName,
    snapshotDate: outcome.snapshotDate,
    drawType,
  }));
  cache = [...batch, ...cache].slice(0, LIMIT);
  persist();
  emit();
}

export function clearHistory(): void {
  ensureInit();
  cache = EMPTY;
  persist();
  emit();
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
