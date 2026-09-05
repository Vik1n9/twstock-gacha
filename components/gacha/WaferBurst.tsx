"use client";

import { useEffect, useRef } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";

// SSR 簽名特效：晶圓陣列光爆（企劃書 14.1）
// 一幀式：環形晶粒擴散 + 放射光線 + 金紅閃光，1.1 秒後自動淡出
export function WaferBurst({
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (low) {
      doneRef.current?.();
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.42;
    const start = performance.now();
    let raf = 0;

    const loop = (t: number) => {
      const p = Math.min((t - start) / 1100, 1); // 0→1
      ctx.clearRect(0, 0, w, h);
      const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;

      // 放射光線
      ctx.save();
      ctx.globalAlpha = 0.5 * fade * (1 - p);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.25 * p, cy + Math.sin(a) * R * 0.25 * p);
        ctx.lineTo(cx + Math.cos(a) * R * (0.5 + p * 0.9), cy + Math.sin(a) * R * (0.5 + p * 0.9));
        ctx.stroke();
      }
      ctx.restore();

      // 晶圓環（晶粒方塊沿環擴散）
      const ringCount = 16;
      for (let i = 0; i < ringCount; i++) {
        const a = (i / ringCount) * Math.PI * 2 + p * 0.6;
        const rr = R * (0.35 + p * 0.75);
        const s = 10 - p * 6;
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = i % 3 === 0 ? theme.accent : theme.primary;
        ctx.fillRect(cx + Math.cos(a) * rr - s / 2, cy + Math.sin(a) * rr - s / 2, s, s);
      }

      // 中心閃光
      const flash = Math.max(0, 1 - p * 3);
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.55;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.9);
        g.addColorStop(0, theme.accent);
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalAlpha = 1;

      if (p < 1) raf = requestAnimationFrame(loop);
      else doneRef.current?.();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [low, theme]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
