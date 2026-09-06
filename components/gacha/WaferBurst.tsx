"use client";

import { useEffect, useRef } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";
import {
  Camera,
  RARITY_COLOR,
  easeOutCubic,
  easeOutQuint,
  fitCanvas,
  mulberry32,
  rgba,
} from "@/lib/fx/core";
import { fxProfile, startFrameLoop } from "@/lib/fx/quality";

// SSR 簽名特效：晶圓陣列光爆（企劃書 14.1）完整版
// 四階段：內爆蓄力 → 白閃衝擊波 → 3D 晶粒環擴散＋旋轉光柵＋十字光斑 → 金塵落下淡出
const DUR = 2600; // ms

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
    if (low) {
      doneRef.current?.();
      return;
    }
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx } = fit;
    let { w, h } = fit;

    const cam = new Camera();
    cam.resize(w, h);
    const rnd = mulberry32(48151);
    const profile = fxProfile();
    const n = (count: number) => Math.max(1, Math.round(count * profile.particleScale));
    const GOLD = RARITY_COLOR.SSR;
    const HOT = "#FFE9B0";

    // 3D 晶粒：從中心往外炸開的方塊，帶自轉與深度
    const dies = Array.from({ length: n(120) }, () => {
      const a = rnd() * Math.PI * 2;
      const el = (rnd() - 0.5) * 0.9;
      return {
        a,
        el,
        speed: 900 + rnd() * 2100,
        z0: -180 + rnd() * 900,
        size: 8 + rnd() * 22,
        rot: rnd() * Math.PI,
        vrot: (rnd() - 0.5) * 9,
        accent: rnd() < 0.45,
      };
    });

    // 金塵
    const motes = Array.from({ length: n(160) }, () => ({
      x: rnd() * w,
      y: -rnd() * h * 0.7,
      vy: 60 + rnd() * 190,
      vx: (rnd() - 0.5) * 40,
      size: 1 + rnd() * 3.2,
      phase: rnd() * Math.PI * 2,
      delay: rnd() * 0.9,
    }));

    const start = performance.now();
    let disposed = false;

    const loop = (now: number) => {
      if (disposed) return;
      const t = (now - start) / 1000;
      const p = Math.min(t / (DUR / 1000), 1);
      const cx = w / 2;
      const cy = h / 2;
      cam.cx = cx;
      cam.cy = cy;

      ctx.clearRect(0, 0, w, h);

      // ── 階段 A：內爆蓄力（0 → 0.28s）收縮的能量環
      if (t < 0.34) {
        const k = t / 0.34;
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 4; i++) {
          const r = (1 - easeOutCubic(k)) * (320 + i * 130) + 18;
          ctx.strokeStyle = rgba(i % 2 ? GOLD : HOT, 0.25 + k * 0.65);
          ctx.lineWidth = 2 + i;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.globalCompositeOperation = "lighter";

      // ── 階段 C1：旋轉放射光柵（風車狀體積光）
      if (t > 0.26) {
        const k = Math.min(1, (t - 0.26) / 1.6);
        const spokes = 26;
        const spin = t * 0.55;
        const reach = Math.max(w, h) * (0.35 + easeOutQuint(k) * 0.95);
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + spin;
          const wob = 0.5 + 0.5 * Math.sin(t * 6 + i);
          const alpha = (1 - k) * (0.06 + wob * 0.1);
          if (alpha <= 0.004) continue;
          const spread = 0.028 + wob * 0.02;
          ctx.fillStyle = rgba(i % 3 === 0 ? HOT : GOLD, alpha);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a - spread) * reach, cy + Math.sin(a - spread) * reach);
          ctx.lineTo(cx + Math.cos(a + spread) * reach, cy + Math.sin(a + spread) * reach);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── 階段 B：衝擊波環（三道錯開）
      for (let i = 0; i < 3; i++) {
        const st = 0.3 + i * 0.16;
        if (t < st) continue;
        const k = Math.min(1, (t - st) / 1.1);
        const r = easeOutQuint(k) * (Math.max(w, h) * (0.7 + i * 0.22));
        const a = (1 - k) * (1 - k) * (i === 0 ? 1 : 0.7);
        ctx.strokeStyle = rgba(i === 0 ? "#ffffff" : GOLD, a);
        ctx.lineWidth = Math.max(0.6, (12 - i * 3) * (1 - k));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 地面壓扁漣漪
        ctx.save();
        ctx.translate(cx, cy + 120);
        ctx.scale(1, 0.2);
        ctx.strokeStyle = rgba(GOLD, a * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ── 階段 C2：3D 晶粒環擴散
      if (t > 0.28) {
        const k = Math.min(1, (t - 0.28) / 1.9);
        const fade = 1 - k * k;
        for (const d of dies) {
          const dist = easeOutQuint(k) * d.speed;
          const x = Math.cos(d.a) * dist;
          const y = Math.sin(d.a) * dist * 0.85 + k * k * 340;
          const z = d.z0 + Math.sin(d.el) * dist * 0.7 + 60;
          if (z < 30) continue;
          const pr = cam.project(x, y, z);
          const size = d.size * pr.s * 3.2;
          if (size < 0.4) continue;
          ctx.save();
          ctx.translate(pr.x, pr.y);
          ctx.rotate(d.rot + t * d.vrot);
          ctx.globalAlpha = Math.max(0, fade);
          ctx.fillStyle = d.accent ? HOT : GOLD;
          ctx.fillRect(-size / 2, -size / 2, size, size * 0.7);
          ctx.globalAlpha = Math.max(0, fade * 0.8);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(0.4, size * 0.07);
          ctx.strokeRect(-size / 2, -size / 2, size, size * 0.7);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      // ── 階段 C3：十字鏡頭光斑
      if (t > 0.3 && t < 1.9) {
        const k = (t - 0.3) / 1.6;
        const a = (1 - k) * 0.85;
        const len = Math.max(w, h) * (0.6 + k * 0.6);
        for (const [dx, dy, thick] of [
          [1, 0, 6],
          [0, 1, 3],
        ] as const) {
          const g = ctx.createLinearGradient(
            cx - dx * len,
            cy - dy * len,
            cx + dx * len,
            cy + dy * len,
          );
          g.addColorStop(0, rgba(HOT, 0));
          g.addColorStop(0.5, rgba(HOT, a));
          g.addColorStop(1, rgba(HOT, 0));
          ctx.fillStyle = g;
          ctx.fillRect(
            cx - (dx ? len : thick),
            cy - (dy ? len : thick),
            dx ? len * 2 : thick * 2,
            dy ? len * 2 : thick * 2,
          );
        }
      }

      // ── 中央亮核
      {
        const k = Math.min(1, t / 0.4);
        const decay = Math.max(0, 1 - Math.max(0, t - 0.4) / 1.4);
        const r = (60 + easeOutCubic(k) * 260) * (0.5 + decay);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, rgba("#ffffff", 0.9 * decay));
        g.addColorStop(0.28, rgba(HOT, 0.6 * decay));
        g.addColorStop(1, rgba(GOLD, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // ── 階段 D：金塵落下
      if (t > 0.5) {
        for (const m of motes) {
          const mt = t - 0.5 - m.delay;
          if (mt < 0) continue;
          const x = m.x + m.vx * mt + Math.sin(mt * 1.8 + m.phase) * 26;
          const y = m.y + m.vy * mt;
          if (y > h + 20) continue;
          const a = Math.max(0, Math.min(1, mt * 2)) * Math.max(0, 1 - (t - 1.4) / 1.2);
          ctx.fillStyle = rgba(m.size > 2.6 ? HOT : GOLD, a * 0.9);
          ctx.beginPath();
          ctx.arc(x, y, m.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";

      // ── 全屏白閃（0.28 → 0.55）
      if (t > 0.28 && t < 0.62) {
        const k = (t - 0.28) / 0.34;
        ctx.fillStyle = rgba("#ffffff", Math.max(0, 0.72 * (1 - k)));
        ctx.fillRect(0, 0, w, h);
      }

      if (p >= 1) {
        ctx.clearRect(0, 0, w, h);
        stopLoop();
        doneRef.current?.();
      }
    };
    const stopLoop = startFrameLoop({ fps: () => profile.fps, draw: loop });

    const onResize = () => {
      const r = fitCanvas(canvas);
      if (r) {
        w = r.w;
        h = r.h;
        cam.resize(w, h);
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      stopLoop();
      window.removeEventListener("resize", onResize);
    };
  }, [low, theme]);

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
  );
}
