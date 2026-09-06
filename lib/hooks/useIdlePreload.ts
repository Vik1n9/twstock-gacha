"use client";

import { useCallback, useEffect, useState } from "react";

// DOM lib 把 requestIdleCallback 宣告為必存在，這裡自己描述成選用以便特徵偵測
interface IdleScheduler {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * 首屏不需要、但互動時要用的重量級模組（GSAP 演出元件約 85 KB）延後載入。
 *
 * - 頁面掛載後不立刻載入，等瀏覽器閒置（requestIdleCallback，最多等 timeout）
 *   才在背景取 chunk，因此不佔用首屏的下載與 parse 時間。
 * - 回傳的 `ensure()` 會等到模組真的就緒才 resolve，供「按下去才需要它」的
 *   路徑呼叫；閒置預載通常已完成，此時幾乎是零等待。
 *
 * `load` 必須是穩定的參考（模組層級的函式），否則預載會在每次 render 重跑。
 * 重複呼叫是安全的：`import()` 由打包器的模組表去重。
 */
export function useIdlePreload<T>(
  load: () => Promise<T>,
): [T | null, () => Promise<T>] {
  const [mod, setMod] = useState<T | null>(null);

  const ensure = useCallback(async () => {
    const m = await load();
    setMod(m);
    return m;
  }, [load]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      // 預載失敗（離線／chunk 404）不需處理：真正要用時 ensure() 會再試一次
      void load()
        .then((m) => {
          if (alive) setMod(m);
        })
        .catch(() => {});
    };
    // requestIdleCallback 在較舊的 Safari 不存在 → 退回 setTimeout
    const w = window as unknown as IdleScheduler;
    const idle = w.requestIdleCallback;
    const handle = idle
      ? idle.call(window, run, { timeout: 3000 })
      : window.setTimeout(run, 1200);
    return () => {
      alive = false;
      if (idle) w.cancelIdleCallback?.(handle);
      else window.clearTimeout(handle);
    };
  }, [load]);

  return [mod, ensure];
}
