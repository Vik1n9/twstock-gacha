"use client";

import { useEffect, useRef } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";

// 板塊主題背景：暗色底 + 電路走線 + 晶片粒子（config 驅動，alpha 供 SEMI）
// 低特效：只畫靜態一幀，不跑 rAF
export function SectorBackdrop({
  theme,
  low = false,
  intensity = 1,
}: {
  theme: SectorTheme;
  low?: boolean;
  intensity?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let disposed = false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      s: number;
      a: number;
      accent: boolean;
    }

    interface Trace {
      pts: { x: number; y: number }[];
    }

    let particles: Particle[] = [];
    let traces: Trace[] = [];
    let w = 0;
    let h = 0;

    function rng(seed: number) {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function build() {
      const r = rng(20260906);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 電路走線：正交折線 + 節點
      traces = [];
      const traceCount = Math.round((w * h) / 26000);
      for (let i = 0; i < traceCount; i++) {
        const pts = [];
        let x = r() * w;
        let y = r() * h;
        pts.push({ x, y });
        const segs = 2 + Math.floor(r() * 3);
        for (let s = 0; s < segs; s++) {
          const len = 30 + r() * 90;
          if (r() < 0.5) x += r() < 0.5 ? len : -len;
          else y += r() < 0.5 ? len : -len;
          pts.push({ x, y });
        }
        traces.push({ pts });
      }

      // 晶片粒子
      const count = Math.round((w * h) / 9000 * intensity);
      particles = Array.from({ length: count }, () => ({
        x: r() * w,
        y: r() * h,
        vx: (r() - 0.5) * 14,
        vy: (r() - 0.5) * 14,
        s: 1.5 + r() * 2.5,
        a: 0.25 + r() * 0.5,
        accent: r() < 0.3,
      }));
    }

    function drawTraces() {
      ctx!.lineWidth = 1;
      for (const t of traces) {
        ctx!.strokeStyle = hexA(theme.primary, 0.13);
        ctx!.beginPath();
        ctx!.moveTo(t.pts[0].x, t.pts[0].y);
        for (let i = 1; i < t.pts.length; i++) ctx!.lineTo(t.pts[i].x, t.pts[i].y);
        ctx!.stroke();
        // 節點
        const last = t.pts[t.pts.length - 1];
        ctx!.fillStyle = hexA(theme.primary, 0.3);
        ctx!.fillRect(last.x - 1.5, last.y - 1.5, 3, 3);
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx!.fillStyle = hexA(p.accent ? theme.accent : theme.primary, p.a);
        ctx!.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    }

    function step(dt: number) {
      ctx!.clearRect(0, 0, w, h);
      drawTraces();
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x += w;
        if (p.x > w) p.x -= w;
        if (p.y < 0) p.y += h;
        if (p.y > h) p.y -= h;
      }
      drawParticles();
    }

    build();
    if (low) {
      step(0); // 靜態一幀
      return () => {
        disposed = true;
      };
    }

    let last = performance.now();
    const loop = (t: number) => {
      if (disposed) return;
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      step(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      build();
      if (low) step(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [theme, low, intensity]);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: theme.bg }}
    >
      <canvas ref={ref} className="h-full w-full" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${theme.primary} 14%, transparent), transparent 70%)`,
        }}
      />
    </div>
  );
}

function hexA(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
