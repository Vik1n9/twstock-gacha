"use client";

import { useCallback, useSyncExternalStore } from "react";

// 低特效模式：使用者手動開關（localStorage）或系統 prefers-reduced-motion
// 企劃書 21：板塊主題特效過多 → 提供低特效模式
const KEY = "twstock-lowfx";

const listeners = new Set<() => void>();
let value = false;
let initialized = false;

function ensureInit(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const stored = localStorage.getItem(KEY);
  value =
    stored !== null
      ? stored === "1"
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 系統設定變動即時跟隨（未手動覆寫時）
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", (e) => {
      if (localStorage.getItem(KEY) === null) {
        value = e.matches;
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
    localStorage.setItem(KEY, v ? "1" : "0");
    listeners.forEach((l) => l());
  }, []);
  return [low, setLow];
}
