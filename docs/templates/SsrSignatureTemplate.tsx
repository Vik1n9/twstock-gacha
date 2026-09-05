"use client";

// SSR 簽名特效模板 —— 複製到 components/gacha/<YourSignature>.tsx。
// 介面必須維持 { theme, low, onDone }，才能被 GachaStage 的 SIGNATURES 查表使用。
// 搭配 docs/卡片與卡池擴充規範.md §5、§7 服用。
//
// 現況：GachaStage 固定渲染 WaferBurst。beta 接上分派後改成
//   const Signature = SIGNATURES[theme.ssrSignature] ?? WaferBurst;
//   {ssrCount > 0 && <Signature theme={theme} low={low} />}

import { useEffect, useRef } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";
import { RARITY_COLOR, easeOutQuint, fitCanvas, mulberry32, rgba } from "@/lib/fx/core";

const DUR = 2400; // ms，整段演出長度

export function SsrSignatureTemplate({
  theme,
  low = false,
  onDone,
}: {
  theme: SectorTheme;
  low?: boolean;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // 守則 1：低特效模式直接跳終態，不跑 rAF、不掛事件
    if (low) {
      doneRef.current?.();
      return;
    }

    // 守則 5：用 fitCanvas 處理 devicePixelRatio
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx } = fit;
    let { w, h } = fit;

    const rnd = mulberry32(20260906);
    const KEY = RARITY_COLOR.SSR; // SSR 橘；要吃板塊色就改用 theme.accent
    const HOT = "#FFE9B0";

    // 守則 3：數量依畫面面積推算並 clamp，不要寫死
    const count = Math.round(Math.min(Math.max((w * h) / 9000, 40), 180));
    const bits = Array.from({ length: count }, () => ({
      a: rnd() * Math.PI * 2,
      speed: 700 + rnd() * 1800,
      size: 6 + rnd() * 18,
      accent: rnd() < 0.4,
    }));

    const start = performance.now();
    let raf = 0;
    let disposed = false;

    const loop = (now: number) => {
      if (disposed) return;
      const t = (now - start) / 1000;
      const p = Math.min(t / (DUR / 1000), 1);
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // ── 這裡換成你的演出。分階段寫，讓節奏有起伏：
      //    A 蓄力（收縮）→ B 爆發（白閃＋衝擊波）→ C 擴散（主體）→ D 餘韻（淡出）
      const k = easeOutQuint(p);
      for (const b of bits) {
        const dist = k * b.speed;
        const x = cx + Math.cos(b.a) * dist;
        const y = cy + Math.sin(b.a) * dist * 0.85;
        ctx.fillStyle = rgba(b.accent ? HOT : KEY, Math.max(0, 1 - p * p));
        ctx.fillRect(x - b.size / 2, y - b.size / 2, b.size, b.size * 0.7);
      }

      ctx.globalCompositeOperation = "source-over";

      // 全屏白閃：控制在 0.3s 內，超過會刺眼
      if (t > 0.2 && t < 0.5) {
        ctx.fillStyle = rgba("#ffffff", Math.max(0, 0.7 * (1 - (t - 0.2) / 0.3)));
        ctx.fillRect(0, 0, w, h);
      }

      if (p < 1) raf = requestAnimationFrame(loop);
      else {
        ctx.clearRect(0, 0, w, h);
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const r = fitCanvas(canvas);
      if (r) {
        w = r.w;
        h = r.h;
      }
    };
    window.addEventListener("resize", onResize);

    // 守則 2：rAF 與 listener 一定要清
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [low, theme]);

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
  );
}
