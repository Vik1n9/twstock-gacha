"use client";

import { useCallback, useSyncExternalStore } from "react";
import { fxProfile } from "@/lib/fx/quality";

// 低特效模式：使用者手動開關（localStorage）或系統 prefers-reduced-motion
// 企劃書 21：板塊主題特效過多 → 提供低特效模式
const KEY = "twstock-lowfx";

const listeners = new Set<() => void>();
let value = false;
let initialized = false;

// 把狀態鏡射到 <html> 上，讓 CSS 也吃得到：
// data-lowfx  → 手動切「低」時停掉卡面的無限動畫（過去只有系統減少動態設定有效，
//               手動切換完全影響不到 CSS，是這個開關長期沒發揮作用的原因）
// data-fxtier → 弱勢裝置停掉最貴的那幾個（混色 + 每幀重繪背景位置）
function syncDom(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.lowfx = value ? "1" : "0";
  root.dataset.fxtier = fxProfile().tier;
}

function readPref(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // 隱私模式下讀 localStorage 會丟例外，退回跟隨系統設定
  }
}

function ensureInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const stored = readPref();
  value =
    stored !== null
      ? stored === "1"
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  syncDom();
  // 系統設定變動即時跟隨（未手動覆寫時）
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (e) => {
      if (readPref() === null) {
        value = e.matches;
        syncDom();
        listeners.forEach((l) => l());
      }
    });
}

function subscribe(l: () => void): () => void {
  ensureInit();
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): boolean {
  ensureInit();
  return value;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useLowFx(): [boolean, (v: boolean) => void] {
  const low = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setLow = useCallback((v: boolean) => {
    ensureInit();
    value = v;
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* 配額或隱私模式：本次切換照樣生效，只是記不住 */
    }
    syncDom();
    listeners.forEach((l) => l());
  }, []);
  return [low, setLow];
}
