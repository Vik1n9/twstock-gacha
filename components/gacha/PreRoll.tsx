"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";
import type { Rarity, RarityFx } from "@/lib/fx/core";
import { RARITY_FX, fitCanvas, mulberry32, rgba } from "@/lib/fx/core";

// 抽卡前置演出（企劃書 13.1 五步驟的電影化版本）
// 快門開場 → 徽章碎片組裝 → 板塊名故障感切入 → 3D 代號滾筒 → 能量匯聚蓄力 → 白閃交棒
// hint：抽卡結果先回來時，用最高稀有度預告改變蓄力顏色（經典「彩光預告」）
// jumpFrom：跳變前兆——先以低階色蓄力預告，於 2.0s 前後「撕裂跳升」為結果色
// （tease 1.78s 低階色＋內吸 surge 0.5 → jump 2.02s 色域跳升＋白閃＋徽章 punch＋中央爆點）
export function PreRoll({
  theme,
  boardName,
  stockCodes,
  low,
  hint = null,
  jumpFrom = null,
  onBoost,
  onJump,
  onDone,
}: {
  theme: SectorTheme;
  boardName: string;
  stockCodes: string[];
  low: boolean;
  hint?: Rarity | null;
  jumpFrom?: "R" | "SR" | null;
  onBoost?: (v: number) => void;
  onJump?: (rarity: Rarity) => void;
  onDone: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const shutterARef = useRef<HTMLDivElement>(null);
  const shutterBRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const fragRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const drumRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const cb = useRef({ onDone, onBoost, onJump });
  const hintRef = useRef<Rarity | null>(hint);
  const jumpFromRef = useRef<"R" | "SR" | null>(jumpFrom ?? null);
  // 跳變時由時間軸控制粒子顯示色（低階 → 高階）；surge 為粒子內吸強度脈衝
  const shownFxRef = useRef<Rarity | null>(null);
  const surgeRef = useRef(0);

  useEffect(() => {
    cb.current = { onDone, onBoost, onJump };
    jumpFromRef.current = jumpFrom ?? null;
  }, [onDone, onBoost, onJump, jumpFrom]);

  // 3D 代號滾筒：把股票代號貼在一圈圓柱面上
  const drumFaces = useMemo(() => {
    const codes = stockCodes.length ? stockCodes : ["----"];
    const n = 14;
    return Array.from({ length: n }, (_, i) => ({
      code: codes[i % codes.length],
      angle: (i / n) * 360,
    }));
  }, [stockCodes]);

  // ── 能量匯聚場：粒子沿螺線收向中心，越後期越密越快
  useEffect(() => {
    if (low) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx } = fit;
    let { w, h } = fit;
    const rnd = mulberry32(7331);
    let raf = 0;
    let disposed = false;
    const start = performance.now();

    interface P {
      a: number;
      r: number;
      v: number;
      size: number;
      spin: number;
      accent: boolean;
    }
    const spawn = (): P => ({
      a: rnd() * Math.PI * 2,
      r: 220 + rnd() * Math.max(w, h) * 0.6,
      v: 90 + rnd() * 220,
      size: 1 + rnd() * 3,
      spin: (rnd() - 0.5) * 1.4,
      accent: rnd() < 0.4,
    });
    const ps: P[] = Array.from({ length: 190 }, spawn);

    let last = start;
    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      const t = (now - start) / 1000;
      const ramp = Math.min(1, t / 2.2);
      // surge：時間軸在 tease/jump 瞬間注入的內吸脈衝，幀間指數衰減
      const surge = surgeRef.current;
      surgeRef.current = surge > 0.001 ? surge * Math.pow(0.25, dt) : 0;
      // 跳變時顯示色由時間軸逐步切換（低階 → 高階）；無跳變維持「hint 即染色」
      let fxs: RarityFx | null = null;
      if (shownFxRef.current) {
        fxs = RARITY_FX[shownFxRef.current];
      } else if (!jumpFromRef.current) {
        const hintFx = hintRef.current ? RARITY_FX[hintRef.current] : null;
        if (hintFx && hintFx.tier >= 2) fxs = hintFx;
      }
      const hot = fxs ? fxs.color : theme.accent;
      const cool = fxs ? fxs.spark : theme.primary;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const p of ps) {
        p.r -= (p.v * (0.6 + ramp * 2.4) + surge * 1300) * dt;
        p.a += p.spin * dt * (0.6 + ramp);
        if (p.r < 26) Object.assign(p, spawn());
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r * 0.78;
        const tail = 10 + ramp * 46;
        const x2 = cx + Math.cos(p.a) * (p.r + tail);
        const y2 = cy + Math.sin(p.a) * (p.r + tail) * 0.78;
        const fade = Math.max(0, 1 - p.r / (Math.max(w, h) * 0.7));
        ctx.strokeStyle = rgba(
          p.accent ? hot : cool,
          Math.min(1, (0.15 + fade * 0.75) * (0.35 + ramp * 0.65) * (1 + surge)),
        );
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 中央蓄能核心（surge 時膨脹發亮：能量被「抽」進來的爆發感）
      const core = 26 + ramp * 76 + Math.sin(t * 14) * (2 + ramp * 8) + surge * 120;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
      g.addColorStop(0, rgba("#ffffff", Math.min(1, 0.55 * ramp * (1 + surge * 0.8))));
      g.addColorStop(0.35, rgba(hot, Math.min(1, 0.5 * ramp * (1 + surge * 0.8))));
      g.addColorStop(1, rgba(hot, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - core, cy - core, core * 2, core * 2);

      // 旋轉符文環
      for (let i = 0; i < 3; i++) {
        const rr = 120 + i * 54 - ramp * 26;
        ctx.strokeStyle = rgba(i % 2 ? cool : hot, Math.min(1, (0.16 + ramp * 0.4) * (1 + surge * 0.5)));
        ctx.lineWidth = 1 + i * 0.5;
        ctx.setLineDash([i === 1 ? 6 : 16, 14 + i * 8]);
        ctx.lineDashOffset = (i % 2 ? -1 : 1) * t * (60 + ramp * 320);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * 0.8, t * 0.3 * (i + 1), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(loop);
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
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [low, theme]);

  // ── 主時間軸
  useEffect(() => {
    if (low) {
      const t = setTimeout(() => cb.current.onDone(), 250);
      return () => clearTimeout(t);
    }
    const root = rootRef.current;
    if (!root) return;

    const frags = fragRefs.current.filter(Boolean) as HTMLDivElement[];
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

    // 快門開場
    tl.fromTo(
      [shutterARef.current, shutterBRef.current],
      { scaleY: 1 },
      { scaleY: 0, duration: 0.55, ease: "power4.inOut", stagger: 0.05 },
    );

    // 徽章碎片從四方飛入組裝
    tl.fromTo(
      frags,
      {
        autoAlpha: 0,
        x: (i: number) => (i % 2 ? 220 : -220),
        y: (i: number) => (i < 2 ? -180 : 180),
        rotation: (i: number) => (i % 2 ? 90 : -90),
        scale: 1.8,
      },
      {
        autoAlpha: 1,
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        duration: 0.62,
        ease: "power4.out",
        stagger: 0.06,
      },
      "-=0.25",
    )
      .to(badgeRef.current, {
        rotationY: 360,
        duration: 0.85,
        ease: "power2.inOut",
      })
      .to(badgeRef.current, { scale: 1.12, duration: 0.16, yoyo: true, repeat: 1 }, "-=0.2");

    // 板塊名切入
    tl.fromTo(
      nameRef.current,
      { clipPath: "inset(0 100% 0 0)", autoAlpha: 1, letterSpacing: "0.8em" },
      {
        clipPath: "inset(0 0% 0 0)",
        letterSpacing: "0.3em",
        duration: 0.7,
        ease: "power3.inOut",
      },
      "-=0.7",
    ).fromTo(
      subRef.current,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.4 },
      "-=0.3",
    );

    // 代號滾筒轉動
    const drum = gsap.to(drumRef.current, {
      rotationY: "-=360",
      duration: 7,
      ease: "none",
      repeat: -1,
    });

    // 蓄力：背景 boost 分段拉高
    tl.call(() => cb.current.onBoost?.(0.25), undefined, 0.2)
      .call(() => cb.current.onBoost?.(0.5), undefined, 1.3)
      .call(() => {
        // 跳變流程接管染色（見下方 tease/jump 兩段）
        if (jumpFromRef.current) return;
        // 已知結果時，稀有度預告把整層染成對應色
        const h = hintRef.current;
        const fx = h ? RARITY_FX[h] : null;
        cb.current.onBoost?.(fx && fx.tier >= 2 ? 1 : 0.8);
        if (fx && fx.tier >= 2 && rootRef.current) {
          gsap.to(rootRef.current, {
            "--fx-hint": fx.color,
            duration: 0.3,
          } as gsap.TweenVars);
          gsap.fromTo(
            flashRef.current,
            { autoAlpha: 0, backgroundColor: fx.spark },
            { autoAlpha: 0.35, duration: 0.18, yoyo: true, repeat: 3 },
          );
        }
      }, undefined, 2.0);

    // 跳變前兆（1.78s）：整層「降階」為低階色蓄力，粒子開始內吸（surge 0.5）
    tl.call(() => {
      const jf = jumpFromRef.current;
      if (!jf) return;
      const lfx = RARITY_FX[jf];
      shownFxRef.current = jf;
      surgeRef.current = 0.5;
      cb.current.onBoost?.(0.8);
      if (rootRef.current) {
        gsap.to(rootRef.current, {
          "--fx-hint": lfx.color,
          duration: 0.18,
        } as gsap.TweenVars);
      }
      gsap.fromTo(
        flashRef.current,
        { autoAlpha: 0, backgroundColor: lfx.spark },
        { autoAlpha: 0.22, duration: 0.14, yoyo: true, repeat: 1 },
      );
    }, undefined, 1.78);

    // 跳變（2.02s）：色域撕裂跳升——低階色瞬間轉為結果色＋白閃＋徽章 punch＋中央爆點
    tl.call(() => {
      const jf = jumpFromRef.current;
      const h = hintRef.current;
      if (!jf || !h) return;
      const ffx = RARITY_FX[h];
      shownFxRef.current = h;
      surgeRef.current = 1;
      cb.current.onBoost?.(1);
      if (rootRef.current) {
        gsap.to(rootRef.current, {
          "--fx-hint": ffx.color,
          duration: 0.22,
          ease: "power4.in",
        } as gsap.TweenVars);
      }
      gsap.fromTo(
        flashRef.current,
        { autoAlpha: 0, backgroundColor: "#ffffff" },
        { autoAlpha: 0.85, duration: 0.1, yoyo: true, repeat: 1 },
      );
      gsap.fromTo(
        badgeRef.current,
        { scale: 1 },
        { scale: 1.18, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.inOut" },
      );
      cb.current.onJump?.(h);
    }, undefined, 2.02);

    // 收場：整層被白光吞掉
    tl.to(
      [badgeRef.current, nameRef.current, subRef.current],
      { autoAlpha: 0, y: -26, scale: 0.9, duration: 0.32, stagger: 0.04 },
      2.35,
    )
      .fromTo(
        flashRef.current,
        { autoAlpha: 0, backgroundColor: "#ffffff" },
        { autoAlpha: 0.9, duration: 0.16, ease: "power2.in" },
        2.5,
      )
      .to(flashRef.current, { autoAlpha: 0, duration: 0.3 })
      .call(() => cb.current.onDone());

    return () => {
      tl.kill();
      drum.kill();
    };
  }, [low]);

  const frags = [
    { clip: "polygon(0 0, 50% 0, 50% 50%, 0 50%)" },
    { clip: "polygon(50% 0, 100% 0, 100% 50%, 50% 50%)" },
    { clip: "polygon(0 50%, 50% 50%, 50% 100%, 0 100%)" },
    { clip: "polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)" },
  ];

  return (
    <div
      ref={rootRef}
      className="scanlines absolute inset-0 overflow-hidden"
      style={{ ["--fx-hint" as string]: theme.accent }}
    >
      {/* 能量匯聚場 */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* 快門 */}
      <div
        ref={shutterARef}
        className="absolute inset-x-0 top-0 h-1/2 origin-top bg-black"
      />
      <div
        ref={shutterBRef}
        className="absolute inset-x-0 bottom-0 h-1/2 origin-bottom bg-black"
      />

      {/* 3D 代號滾筒 */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ perspective: 900 }}
      >
        <div
          ref={drumRef}
          className="relative h-10 w-[520px]"
          style={{ transformStyle: "preserve-3d" }}
        >
          {drumFaces.map((f, i) => (
            <div
              key={i}
              className="absolute inset-0 flex items-center justify-center font-mono text-2xl tracking-[0.4em]"
              style={{
                transform: `rotateY(${f.angle}deg) translateZ(240px)`,
                color: theme.accent,
                opacity: 0.32,
                textShadow: `0 0 18px ${theme.accent}`,
              }}
            >
              {f.code}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5">
        {/* 板塊徽章（四碎片組裝，整體可 3D 旋轉） */}
        <div style={{ perspective: 800 }}>
          <div
            ref={badgeRef}
            className="relative h-28 w-28"
            style={{ transformStyle: "preserve-3d" }}
          >
            {frags.map((f, i) => (
              <div
                key={i}
                ref={(el) => {
                  fragRefs.current[i] = el;
                }}
                className="absolute inset-0 flex items-center justify-center rounded-2xl text-4xl font-black"
                style={{
                  clipPath: f.clip,
                  background: `linear-gradient(150deg, color-mix(in srgb, ${theme.primary} 42%, #10131a), #0a0c12)`,
                  border: `2px solid var(--fx-hint)`,
                  color: "var(--fx-hint)",
                  boxShadow: `0 0 40px color-mix(in srgb, ${theme.primary} 55%, transparent)`,
                }}
              >
                ▤
              </div>
            ))}
          </div>
        </div>

        <div
          ref={nameRef}
          data-text={boardName}
          className="text-glitch text-4xl font-black tracking-[0.3em]"
          style={{
            color: theme.primary,
            textShadow: `0 0 30px color-mix(in srgb, ${theme.primary} 75%, transparent), 0 0 80px color-mix(in srgb, ${theme.primary} 35%, transparent)`,
          }}
        >
          {boardName}
        </div>

        <div ref={subRef} className="dim invisible text-sm tracking-[0.35em]">
          正在進入板塊卡池…
        </div>
      </div>

      {/* 白閃 */}
      <div ref={flashRef} className="pointer-events-none absolute inset-0 opacity-0" />
    </div>
  );
}
