"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";
import {
  RARITY_FX,
  type Rarity,
  easeInCubic,
  easeOutCubic,
  easeOutQuint,
  fitCanvas,
  rgba,
} from "@/lib/fx/core";

// 翻牌命中特效層：全畫面共用一張 canvas，任何卡片翻開時往指定座標丟一發爆點。
// 依稀有度分級：C 只有幾點火星，SSR 有衝擊波環＋光柱＋晶粒碎片＋金塵＋鏡頭光斑＋震動。
export interface RevealFxHandle {
  burst: (x: number, y: number, rarity: Rarity) => void;
  // 內爆收束：光環由外向內塌陷、火星倒吸進命中點。
  // 跳變（昇格）時夾在「低階爆點」與「結果色爆點」中間，讀起來像低階結果被收走。
  implode: (x: number, y: number, rarity: Rarity) => void;
  clear: () => void;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  r0: number;
  r1: number;
  width: number;
  color: string;
  squash: number;
  inward?: boolean; // true＝由 r1 塌陷到 r0（內爆）
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  rot: number;
  vrot: number;
  size: number;
  t: number;
  life: number;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  width: number;
  grav?: number; // 重力（內爆的倒吸火星設 0）
  drag?: number; // 每秒殘餘速度比，越小衰減越快
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  phase: number;
}

interface Pillar {
  x: number;
  y: number;
  t: number;
  life: number;
  width: number;
  color: string;
}

interface Flare {
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
  power: number;
}

export const RevealFx = forwardRef<
  RevealFxHandle,
  { theme: SectorTheme; low?: boolean; shakeTarget?: React.RefObject<HTMLElement | null> }
>(function RevealFx({ theme, low = false, shakeTarget }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<RevealFxHandle>({
    burst: () => {},
    implode: () => {},
    clear: () => {},
  });

  useImperativeHandle(ref, () => ({
    burst: (x, y, rarity) => api.current.burst(x, y, rarity),
    implode: (x, y, rarity) => api.current.implode(x, y, rarity),
    clear: () => api.current.clear(),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let ctx: CanvasRenderingContext2D | null = null;
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;
    let disposed = false;
    let last = 0;

    const rings: Ring[] = [];
    const shards: Shard[] = [];
    const sparks: Spark[] = [];
    const motes: Mote[] = [];
    const pillars: Pillar[] = [];
    const flares: Flare[] = [];
    let flash = 0;
    let flashColor = "#ffffff";

    const build = () => {
      const fit = fitCanvas(canvas);
      if (!fit) return;
      ctx = fit.ctx;
      w = fit.w;
      h = fit.h;
    };
    build();

    const alive = () =>
      rings.length ||
      shards.length ||
      sparks.length ||
      motes.length ||
      pillars.length ||
      flares.length ||
      flash > 0.001;

    const shake = (amount: number) => {
      const el = shakeTarget?.current;
      if (!el || amount <= 0) return;
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { x: 0, y: 0 },
        {
          x: 0,
          y: 0,
          duration: 0.55,
          ease: "none",
          onUpdate() {
            const p = 1 - this.progress();
            gsap.set(el, {
              x: (Math.random() - 0.5) * amount * p * 2,
              y: (Math.random() - 0.5) * amount * p * 2,
            });
          },
          onComplete: () => gsap.set(el, { x: 0, y: 0 }),
        },
      );
    };

    api.current.clear = () => {
      rings.length = 0;
      shards.length = 0;
      sparks.length = 0;
      motes.length = 0;
      pillars.length = 0;
      flares.length = 0;
      flash = 0;
    };

    api.current.implode = (x, y, rarity) => {
      if (low || !ctx) return;
      const fx = RARITY_FX[rarity];

      // 塌陷環：外圈先慢後快地收進命中點，越close越亮
      for (let i = 0; i < 2 + fx.tier; i++) {
        rings.push({
          x,
          y,
          t: -i * 0.045,
          life: 0.34,
          r0: 8,
          r1: 250 + i * 95,
          width: 2.5 + i * 1.2,
          color: i === 0 ? "#ffffff" : fx.color,
          squash: 1,
          inward: true,
        });
      }

      // 倒吸火星：從四周朝命中點衝，無重力、低衰減
      for (let i = 0; i < 22 + fx.tier * 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = 250 + Math.random() * 330;
        const sp = 760 + Math.random() * 900;
        sparks.push({
          x: x + Math.cos(a) * rad,
          y: y + Math.sin(a) * rad,
          vx: -Math.cos(a) * sp,
          vy: -Math.sin(a) * sp,
          t: 0,
          life: 0.28 + Math.random() * 0.12,
          color: Math.random() < 0.5 ? "#ffffff" : fx.spark,
          width: 1 + Math.random() * 2.2,
          grav: 0,
          drag: 0.55,
        });
      }

      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    api.current.burst = (x, y, rarity) => {
      if (low || !ctx) return;
      const fx = RARITY_FX[rarity];
      const themed = fx.color;

      // 衝擊波環：由內往外擴，SSR 有三層錯開時間
      for (let i = 0; i < fx.rings; i++) {
        rings.push({
          x,
          y,
          t: -i * 0.12,
          life: 0.75 + i * 0.16,
          r0: 12,
          r1: 190 + i * 130 + fx.tier * 60,
          width: 7 - i * 1.6,
          color: i === 0 ? "#ffffff" : themed,
          squash: 1,
        });
      }
      // 地面漣漪（壓扁的環），做出「打在平面上」的空間感
      if (fx.tier >= 2) {
        rings.push({
          x,
          y: y + 40,
          t: 0,
          life: 1.1,
          r0: 20,
          r1: 320,
          width: 3,
          color: themed,
          squash: 0.22,
        });
      }

      // 晶粒碎片：帶 z 的方塊，往外炸開後受重力落下
      for (let i = 0; i < fx.shards; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 220 + Math.random() * 620 + fx.tier * 90;
        shards.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.8 - 120,
          z: 0,
          vz: (Math.random() - 0.3) * 420,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 14,
          size: 5 + Math.random() * 13,
          t: 0,
          life: 0.9 + Math.random() * 0.7,
          color: Math.random() < 0.4 ? fx.spark : themed,
        });
      }

      // 火星：細長拖尾，速度衰減
      for (let i = 0; i < fx.sparks; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 300 + Math.random() * 1100 + fx.tier * 160;
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          t: 0,
          life: 0.35 + Math.random() * 0.55,
          color: Math.random() < 0.5 ? "#ffffff" : fx.spark,
          width: 1 + Math.random() * 2.4,
        });
      }

      // 光柱：SR 以上，從命中點往上下拉開的體積光
      if (fx.tier >= 2) {
        pillars.push({
          x,
          y,
          t: 0,
          life: fx.tier >= 3 ? 1.5 : 0.9,
          width: fx.tier >= 3 ? 150 : 82,
          color: themed,
        });
      }

      // 鏡頭光斑（水平變形光條）＋ 金塵飄落：SSR 專屬
      if (fx.tier >= 3) {
        flares.push({ x, y, t: 0, life: 1.5, color: fx.spark, power: 1 });
        for (let i = 0; i < 90; i++) {
          motes.push({
            x: x + (Math.random() - 0.5) * 460,
            y: y + (Math.random() - 0.5) * 340,
            vx: (Math.random() - 0.5) * 60,
            vy: 30 + Math.random() * 110,
            t: 0,
            life: 1.8 + Math.random() * 1.6,
            size: 1.5 + Math.random() * 3.5,
            color: Math.random() < 0.5 ? fx.color : fx.spark,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }

      if (fx.flash > flash) {
        flash = fx.flash;
        flashColor = fx.tier >= 3 ? fx.spark : "#ffffff";
      }
      shake(fx.shake);

      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    function step<T extends { t: number; life: number }>(arr: T[], dt: number) {
      for (let i = arr.length - 1; i >= 0; i--) {
        arr[i].t += dt;
        if (arr[i].t >= arr[i].life) arr.splice(i, 1);
      }
    }

    function frame(now: number) {
      if (disposed || !ctx) return;
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      const c = ctx;
      c.clearRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";

      // 光柱
      for (const p of pillars) {
        const k = Math.max(0, p.t / p.life);
        const grow = easeOutQuint(Math.min(1, k * 2.4));
        const fade = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
        const halfW = (p.width * grow) / 2;
        const g = c.createLinearGradient(p.x - halfW, 0, p.x + halfW, 0);
        g.addColorStop(0, rgba(p.color, 0));
        g.addColorStop(0.5, rgba(p.color, 0.5 * fade));
        g.addColorStop(1, rgba(p.color, 0));
        c.fillStyle = g;
        const reach = h * grow;
        c.fillRect(p.x - halfW, p.y - reach, halfW * 2, reach * 2);
      }

      // 衝擊波環
      for (const r of rings) {
        if (r.t < 0) continue;
        const k = r.t / r.life;
        // 外擴：先快後慢；內爆：先慢後急（塌陷感），且越收越亮
        const rad = r.inward
          ? r.r1 + (r.r0 - r.r1) * easeInCubic(k)
          : r.r0 + (r.r1 - r.r0) * easeOutQuint(k);
        const a = r.inward ? k * k : (1 - k) * (1 - k);
        c.save();
        c.translate(r.x, r.y);
        c.scale(1, r.squash);
        c.strokeStyle = rgba(r.color, a * 0.9);
        c.lineWidth = Math.max(0.5, r.width * (1 - k));
        c.beginPath();
        c.arc(0, 0, rad, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }

      // 火星
      for (const s of sparks) {
        const k = s.t / s.life;
        const drag = Math.pow(s.drag ?? 0.012, dt);
        s.vx *= drag;
        s.vy *= drag;
        s.vy += (s.grav ?? 380) * dt;
        const px = s.x;
        const py = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        c.strokeStyle = rgba(s.color, (1 - k) * 0.95);
        c.lineWidth = s.width * (1 - k * 0.6);
        c.beginPath();
        c.moveTo(px, py);
        c.lineTo(s.x, s.y);
        c.stroke();
      }

      // 晶粒碎片（帶 z 的透視縮放）
      for (const s of shards) {
        const k = s.t / s.life;
        s.vy += 900 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.vx *= Math.pow(0.35, dt);
        s.rot += s.vrot * dt;
        const scale = 620 / (620 + Math.max(-560, s.z));
        const size = s.size * scale;
        c.save();
        c.translate(s.x, s.y);
        c.rotate(s.rot);
        c.globalAlpha = (1 - k) * 0.95;
        c.fillStyle = s.color;
        c.fillRect(-size / 2, -size / 2, size, size * 0.72);
        c.globalAlpha = 1;
        c.restore();
      }

      // 金塵
      for (const m of motes) {
        const k = m.t / m.life;
        m.x += (m.vx + Math.sin(m.t * 2.4 + m.phase) * 34) * dt;
        m.y += m.vy * dt;
        const a = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.9;
        c.fillStyle = rgba(m.color, Math.max(0, a));
        c.beginPath();
        c.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        c.fill();
      }

      // 鏡頭光斑：水平變形光條 + 中心亮核
      for (const f of flares) {
        const k = f.t / f.life;
        const a = (1 - k) * (k < 0.1 ? k / 0.1 : 1);
        const len = w * (0.35 + easeOutCubic(Math.min(1, k * 2)) * 0.75);
        const g = c.createLinearGradient(f.x - len, f.y, f.x + len, f.y);
        g.addColorStop(0, rgba(f.color, 0));
        g.addColorStop(0.5, rgba(f.color, a * 0.75));
        g.addColorStop(1, rgba(f.color, 0));
        c.fillStyle = g;
        c.fillRect(f.x - len, f.y - 3.5, len * 2, 7);
        const rg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 190 * (0.4 + k));
        rg.addColorStop(0, rgba(f.color, a * 0.9));
        rg.addColorStop(1, rgba(f.color, 0));
        c.fillStyle = rg;
        c.fillRect(f.x - 220, f.y - 220, 440, 440);
      }

      c.globalCompositeOperation = "source-over";

      // 全屏閃光
      if (flash > 0.001) {
        c.fillStyle = rgba(flashColor, flash);
        c.fillRect(0, 0, w, h);
        flash *= Math.pow(0.0016, dt);
      }

      step(rings, dt);
      step(shards, dt);
      step(sparks, dt);
      step(motes, dt);
      step(pillars, dt);
      step(flares, dt);

      if (alive()) raf = requestAnimationFrame(frame);
      else {
        running = false;
        c.clearRect(0, 0, w, h);
      }
    }

    const onResize = () => build();
    window.addEventListener("resize", onResize);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [theme, low, shakeTarget]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
    />
  );
});
