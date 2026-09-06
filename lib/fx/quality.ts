// 特效品質分級與幀率治理
//
// 手機過熱的根因不是「某一個特效太貴」，而是三件事疊在一起：
//   1. 全螢幕 canvas 以 devicePixelRatio 2 繪製 → 像素量是 CSS 尺寸的 4 倍
//   2. rAF 不設上限 → 高更新率螢幕（90/120Hz）直接把工作量再乘 1.5~2 倍
//   3. 結果頁停留期間背景仍以全速演出 → 玩家看卡的每一分鐘都在燒 GPU
//
// 這裡集中處理「畫多細」與「畫多快」，各 canvas 元件只要問 fxProfile()
// 並用 startFrameLoop() 取代裸的 requestAnimationFrame 即可。

export type FxTier = "low" | "mid" | "high";

export interface FxProfile {
  tier: FxTier;
  /** canvas 解析度上限（相對 CSS 像素）；背景這種模糊圖層 1.0~1.5 就夠 */
  maxDpr: number;
  /** 粒子數量倍率 */
  particleScale: number;
  /** 是否啟用 bloom（需要把整張畫面讀回來，是最貴的一步） */
  bloom: boolean;
  /** 是否啟用顆粒噪點（全螢幕 overlay 混色） */
  grain: boolean;
  /** 神光束數量 */
  godRays: number;
  /** 演出中的張數上限 */
  fps: number;
  /** 無演出（結果頁停留）時的張數上限 */
  idleFps: number;
}

const PROFILES: Record<FxTier, FxProfile> = {
  low: {
    tier: "low",
    maxDpr: 1,
    particleScale: 0.4,
    bloom: false,
    grain: false,
    godRays: 2,
    fps: 30,
    idleFps: 20,
  },
  mid: {
    tier: "mid",
    maxDpr: 1.5,
    particleScale: 0.65,
    bloom: true,
    grain: false,
    godRays: 3,
    fps: 45,
    idleFps: 24,
  },
  high: {
    tier: "high",
    maxDpr: 2,
    particleScale: 1,
    bloom: true,
    grain: true,
    godRays: 5,
    fps: 60,
    idleFps: 30,
  },
};

export interface DeviceHints {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory（GB，僅 Chromium 提供） */
  memoryGb?: number;
  /** matchMedia("(pointer: coarse)")：觸控為主的裝置 */
  coarsePointer?: boolean;
}

// 分級規則（純函式，方便測試）：
// 觸控裝置一律不給 high — 手機 SoC 的持續散熱能力遠低於瞬時效能，
// 用跑分挑等級會在前 30 秒看起來很好、之後降頻到比 mid 還糟。
export function detectTier(h: DeviceHints): FxTier {
  const cores = h.cores ?? 4;
  const memoryGb = h.memoryGb ?? 4;
  if (h.coarsePointer) return cores <= 4 || memoryGb <= 3 ? "low" : "mid";
  if (cores <= 4 || memoryGb <= 4) return "mid";
  return "high";
}

export function profileFor(tier: FxTier): FxProfile {
  return PROFILES[tier];
}

let cached: FxProfile | null = null;

function readHints(): DeviceHints {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    coarsePointer:
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : undefined,
  };
}

/** 目前裝置的特效檔次（偵測一次後快取；SSR 期間回 mid 這個安全中間值） */
export function fxProfile(): FxProfile {
  if (cached) return cached;
  if (typeof window === "undefined") return PROFILES.mid;
  cached = PROFILES[detectTier(readHints())];
  return cached;
}

/** 測試與手動覆寫用；傳 null 還原為自動偵測 */
export function setFxTier(tier: FxTier | null): void {
  cached = tier ? PROFILES[tier] : null;
}

export interface FrameLoopOptions {
  /** 每幀查詢目標張數，讓呼叫端可以隨演出階段調整（例如結果頁降到 idleFps） */
  fps: () => number;
  /** dt 已鉗在 0.05 秒內，避免分頁切回時物理量爆衝 */
  draw: (nowMs: number, dtSec: number) => void;
  /**
   * 連續超出時間預算時呼叫，讓呼叫端自行降級（關 bloom、減粒子…）。
   * 每次觸發後內部統計會重置，因此呼叫端每降一級才會再收到一次。
   */
  onBudgetExceeded?: () => void;
}

/**
 * 受管的 rAF 迴圈：限制張數、分頁隱藏時完全停機、繪製超時自動回報。
 * 回傳 stop()。
 */
export function startFrameLoop(o: FrameLoopOptions): () => void {
  let raf = 0;
  let stopped = false;
  let lastDrawn = performance.now();
  // 繪製耗時的指數移動平均：直接量「我們做了多少工」，比量幀間隔可靠
  let costEma = 0;
  let overMs = 0;

  const frame = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);

    const targetFps = Math.max(1, o.fps());
    const minInterval = 1000 / targetFps;
    // 容差 2ms：目標 60fps 在 60Hz 螢幕上不會因為些微抖動被誤判成該跳過
    if (now - lastDrawn < minInterval - 2) return;

    const dt = Math.min((now - lastDrawn) / 1000, 0.05);
    lastDrawn = now;

    const t0 = performance.now();
    o.draw(now, dt);
    const cost = performance.now() - t0;

    costEma = costEma === 0 ? cost : costEma * 0.9 + cost * 0.1;
    // 單幀繪製吃掉超過六成的可用時間就算超支：留給合成、GC 與其他圖層
    if (costEma > minInterval * 0.6) {
      overMs += minInterval;
      if (overMs > 1500 && o.onBudgetExceeded) {
        overMs = 0;
        costEma = 0;
        o.onBudgetExceeded();
      }
    } else {
      overMs = 0;
    }
  };

  const onVisibility = () => {
    if (stopped) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      // 重新開始計時，否則第一幀的 dt 會是整段隱藏時間
      lastDrawn = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
