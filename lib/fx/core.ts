// 特效共用核心：色彩、緩動、亂數、偽 3D 投影
// 不依賴 WebGL：以 Canvas 2D + 透視投影達成深度感，行動裝置也吃得住。

export type Rarity = "C" | "R" | "SR" | "SSR";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexRgb(hex: string): RGB {
  const n = hex.replace("#", "");
  const s = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  const c = (k: keyof RGB) => Math.round(x[k] + (y[k] - x[k]) * t);
  return `rgb(${c("r")},${c("g")},${c("b")})`;
}

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 幀率無關的指數逼近（damp），避免不同螢幕更新率下手感不同
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 針孔相機透視投影：世界座標 (x, y, z) → 螢幕座標 + 縮放
export class Camera {
  f = 620; // 焦距，越大透視越平
  cx = 0;
  cy = 0;
  near = 24;

  resize(w: number, h: number) {
    this.cx = w / 2;
    this.cy = h / 2;
    this.f = Math.max(w, h) * 0.72;
  }

  project(x: number, y: number, z: number) {
    const d = z + this.near;
    const s = this.f / d;
    return { x: this.cx + x * s, y: this.cy + y * s, s };
  }
}

// 稀有度演出參數：越高階，光更亮、粒子更多、鏡頭更用力
export interface RarityFx {
  color: string;
  spark: string;
  tier: 0 | 1 | 2 | 3;
  rings: number;
  shards: number;
  sparks: number;
  flash: number; // 全屏閃白強度 0..1
  shake: number; // 鏡頭震動像素
  hold: number; // 定格時間 ms
}

// 稀有度色階（唯一真相來源，CSS 變數與 canvas 特效共用）
// C 白 → R 藍 → SR 紫 → SSR 橘
export const RARITY_COLOR: Record<Rarity, string> = {
  C: "#E6EDF7",
  R: "#4FA3FF",
  SR: "#B26BFF",
  SSR: "#FF8A2B",
};

export const RARITY_LINE: Record<Rarity, string> = {
  C: "#4A5464",
  R: "#2B5F9E",
  SR: "#6B3FA8",
  SSR: "#A85416",
};

// 稀有度演出參數：越高階，光更亮、粒子更多、鏡頭更用力
export interface RarityFx {
  color: string;
  spark: string;
  tier: 0 | 1 | 2 | 3;
  rings: number;
  shards: number;
  sparks: number;
  flash: number; // 全屏閃白強度 0..1
  shake: number; // 鏡頭震動像素
  hold: number; // 定格時間 ms
}

export const RARITY_FX: Record<Rarity, RarityFx> = {
  C: {
    color: RARITY_COLOR.C,
    spark: "#FFFFFF",
    tier: 0,
    rings: 0,
    shards: 0,
    sparks: 10,
    flash: 0,
    shake: 0,
    hold: 0,
  },
  R: {
    color: RARITY_COLOR.R,
    spark: "#B9DBFF",
    tier: 1,
    rings: 1,
    shards: 6,
    sparks: 26,
    flash: 0.08,
    shake: 2,
    hold: 120,
  },
  SR: {
    color: RARITY_COLOR.SR,
    spark: "#EBD3FF",
    tier: 2,
    rings: 2,
    shards: 16,
    sparks: 58,
    flash: 0.2,
    shake: 6,
    hold: 320,
  },
  SSR: {
    color: RARITY_COLOR.SSR,
    spark: "#FFD9A0",
    tier: 3,
    rings: 3,
    shards: 34,
    sparks: 120,
    flash: 0.55,
    shake: 14,
    hold: 700,
  },
};

export const RARITY_RANK: Record<Rarity, number> = { C: 0, R: 1, SR: 2, SSR: 3 };

export function topRarity(list: { rarity: Rarity }[]): Rarity {
  let best: Rarity = "C";
  for (const c of list) if (RARITY_RANK[c.rarity] > RARITY_RANK[best]) best = c.rarity;
  return best;
}

// 建立高解析度 canvas context（處理 devicePixelRatio）
export function fitCanvas(
  canvas: HTMLCanvasElement,
  maxDpr = 2,
): { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}
