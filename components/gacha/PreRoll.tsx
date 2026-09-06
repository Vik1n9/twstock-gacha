"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";
import type { Rarity, RarityFx } from "@/lib/fx/core";
import { RARITY_FX, fitCanvas, mulberry32, rgba } from "@/lib/fx/core";

// 抽卡前置演出（企劃書 13.1 五步驟的電影化版本）
// 快門開場 → 徽章碎片組裝 → 板塊名故障感切入 → 3D 代號滾筒 → 能量匯聚蓄力 → 白閃交棒
//
// hint：抽卡結果先回來時，用最高稀有度預告改變蓄力顏色（經典「彩光預告」）
//
// jumpFrom：跳變（昇格）演出。分四拍，靠「先給一個看似已定案的低階結果」製造落差：
//   A 假結局 0.62s  能量減速停轉、低階色蓋章落定 →「喔…只有 R」
//   B 異常   0.42s  暗角收攏、蓋章故障龜裂、粒子近乎停格 → 屏息
//   C 撕裂   0.52s  停格後畫面自中央鋸齒撕開，低階色兩片扯離，結果色從後面炸出
//   D 餘韻   0.42s  結果色滿場、字母定格
//
// 結果沒回來就不會有 hint／jumpFrom，因此時間軸在 1.70s 設了一道閘門（GATE_AT）：
// 結果未到就停在滿蓄力等待，避免在慢速連線下把預告與跳變整段跳過（Neon 免費方案
// 限流時 /api/draw 動輒數秒，這是常態而非邊界情況）。實際演出長度因此不固定，
// 由 onDone 通知上層，不再由固定的 sleep 控制。

const GATE_AT = 1.7; // 閘門位置（秒）
const GATE_MAX_WAIT_MS = 6000; // 結果遲遲不來的保險上限
const RESUME_AT = 2.15; // 跳變演完後主時間軸接回的位置（跳過已完成的預告染色）

// 撕裂縫的鋸齒邊：左右兩片共用同一條邊界，扯開時像被撕開的紙
const SEAM_POINTS = (() => {
  const rnd = mulberry32(20260906);
  return Array.from({ length: 15 }, (_, i) => {
    const y = (i / 14) * 100;
    const x = 50 + (rnd() - 0.5) * 8;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
})();
const SEAM_LEFT = `polygon(0% 0%, ${SEAM_POINTS.join(", ")}, 0% 100%)`;
const SEAM_RIGHT = `polygon(100% 0%, ${SEAM_POINTS.join(", ")}, 100% 100%)`;

// 能量場的即時狀態，由時間軸推、由 rAF 迴圈讀
interface Field {
  surge: number; // 內吸脈衝（能量被抽進中心）
  blast: number; // 外炸脈衝（跳變瞬間粒子被推開）
  drag: number; // 運動倍率：1 正常、<1 減速（假結局）、>1 加速
  freeze: number; // >0.5 完全停格
  core: number; // 中央核心亮度倍率（字母亮相時壓低，免得字被自己的光吃掉）
}

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
  // 跳變專用層
  const stampRef = useRef<HTMLDivElement>(null);
  const slamRef = useRef<HTMLDivElement>(null);
  const slamInnerRef = useRef<HTMLDivElement>(null);
  const crackRef = useRef<HTMLDivElement>(null);
  const capLowRef = useRef<HTMLDivElement>(null);
  const capHighRef = useRef<HTMLDivElement>(null);
  const tearLRef = useRef<HTMLDivElement>(null);
  const tearRRef = useRef<HTMLDivElement>(null);
  const seamRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);

  const cb = useRef({ onDone, onBoost, onJump });
  const hintRef = useRef<Rarity | null>(hint);
  const jumpFromRef = useRef<"R" | "SR" | null>(jumpFrom ?? null);
  // 跳變時由時間軸控制粒子顯示色（低階 → 高階）
  const shownFxRef = useRef<Rarity | null>(null);
  const fieldRef = useRef<Field>({ surge: 0, blast: 0, drag: 1, freeze: 0, core: 1 });
  const jumpDoneRef = useRef(false);
  const gateRef = useRef<(() => void) | null>(null);
  const jumpTlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    cb.current = { onDone, onBoost, onJump };
    hintRef.current = hint;
    jumpFromRef.current = jumpFrom ?? null;
    // 結果到了 → 放行卡在閘門的時間軸（DOM 此時已含 stamp/slam 的字母）
    if (hint !== null) gateRef.current?.();
  }, [onDone, onBoost, onJump, hint, jumpFrom]);

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

    let last = performance.now();
    // animT：只在非停格時前進，讓「停格」連環的轉動與核心脈動一起靜止
    let animT = 0;
    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;

      const f = fieldRef.current;
      f.surge = f.surge > 0.001 ? f.surge * Math.pow(0.25, dt) : 0;
      f.blast = f.blast > 0.001 ? f.blast * Math.pow(0.02, dt) : 0;
      const motion = f.freeze > 0.5 ? 0 : f.drag;
      animT += dt * (f.freeze > 0.5 ? 0 : 1);

      const t = animT;
      const ramp = Math.min(1, t / 2.2);
      const { surge, blast } = f;
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
      const far = Math.max(w, h);

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const p of ps) {
        // blast 為負向消耗＝把粒子往外推（撕裂瞬間的衝擊）
        p.r -=
          (p.v * (0.6 + ramp * 2.4) * motion + surge * 1300 - blast * 3200) * dt;
        p.a += p.spin * dt * (0.6 + ramp) * motion;
        if (p.r < 26) Object.assign(p, spawn());
        else if (p.r > far * 1.4) p.r = far * 1.4;
        const x = cx + Math.cos(p.a) * p.r;
        const y = cy + Math.sin(p.a) * p.r * 0.78;
        const tail = (10 + ramp * 46) * (0.25 + motion * 0.75) * (1 + blast * 2.2);
        const x2 = cx + Math.cos(p.a) * (p.r + tail);
        const y2 = cy + Math.sin(p.a) * (p.r + tail) * 0.78;
        const fade = Math.max(0, 1 - p.r / (far * 0.7));
        ctx.strokeStyle = rgba(
          p.accent ? hot : cool,
          Math.min(
            1,
            (0.15 + fade * 0.75) * (0.35 + ramp * 0.65) * (1 + surge + blast),
          ),
        );
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 中央蓄能核心（surge 時膨脹發亮：能量被「抽」進來的爆發感）
      const core =
        (26 + ramp * 76 + Math.sin(t * 14) * (2 + ramp * 8) + surge * 120 + blast * 220) *
        f.core;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
      g.addColorStop(0, rgba("#ffffff", Math.min(1, 0.55 * ramp * (1 + surge * 0.8 + blast))));
      g.addColorStop(0.35, rgba(hot, Math.min(1, 0.5 * ramp * (1 + surge * 0.8 + blast))));
      g.addColorStop(1, rgba(hot, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - core, cy - core, core * 2, core * 2);

      // 旋轉符文環
      for (let i = 0; i < 3; i++) {
        const rr = 120 + i * 54 - ramp * 26 + blast * 90;
        ctx.strokeStyle = rgba(
          i % 2 ? cool : hot,
          Math.min(1, (0.16 + ramp * 0.4) * (1 + surge * 0.5 + blast)),
        );
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
    let gateTimer = 0;

    // ── 跳變（昇格）演出：假結局 → 異常 → 撕裂 → 餘韻
    const playJump = (onFinish: () => void) => {
      const jf = jumpFromRef.current;
      const target = hintRef.current;
      if (!jf || !target) {
        onFinish();
        return;
      }
      jumpDoneRef.current = true;

      const lfx = RARITY_FX[jf];
      const ffx = RARITY_FX[target];
      const big = ffx.tier >= 3; // SSR 昇格：每一段都再加碼
      const field = fieldRef.current;
      const stamp = stampRef.current;
      const slam = slamRef.current;
      const slamInner = slamInnerRef.current;
      const cap = capHighRef.current; // 昇格後的標語（規格外／昇格）
      const jtl = gsap.timeline({ onComplete: onFinish });
      jumpTlRef.current = jtl;

      gsap.set(root, { ["--fx-tear" as string]: lfx.color });
      gsap.set([tearLRef.current, tearRRef.current], {
        autoAlpha: 0,
        x: 0,
        rotation: 0,
      });

      // ── A 假結局：能量減速停轉，低階色蓋章落定
      jtl
        .call(() => {
          shownFxRef.current = jf;
          field.surge = 0.18;
          cb.current.onBoost?.(0.42);
        })
        .to(root, { ["--fx-hint" as string]: lfx.color, duration: 0.18 }, 0)
        .to(field, { drag: 0.3, duration: 0.4, ease: "power2.out" }, 0)
        .fromTo(
          stamp,
          { autoAlpha: 0, scale: 2.1, filter: "blur(10px)" },
          {
            autoAlpha: 1,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.3,
            ease: "power4.out",
          },
          0.06,
        )
        // 蓋章落槌：縮一下再彈回，像印章壓上去
        .to(stamp, { scale: 0.93, duration: 0.08, ease: "power2.in" }, 0.36)
        .to(stamp, { scale: 1, duration: 0.22, ease: "elastic.out(1, 0.45)" }, 0.44)
        .fromTo(
          capLowRef.current,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 0.75, y: 0, duration: 0.22 },
          0.42,
        )
        // 徽章與板塊名退到背景，畫面交給蓋章（否則三者疊在正中央互相打架）
        .to(
          [badgeRef.current, nameRef.current, subRef.current],
          { autoAlpha: 0.1, scale: 0.86, duration: 0.3 },
          0.08,
        );

      // ── B 異常：暗角收攏、蓋章故障龜裂、粒子近乎停格
      jtl
        .to(vignetteRef.current, { autoAlpha: 0.88, duration: 0.26 }, 0.62)
        .to(field, { drag: 0.05, duration: 0.3, ease: "power3.in" }, 0.62)
        .to(capLowRef.current, { autoAlpha: 0, duration: 0.18 }, 0.68)
        // 蓋章開始抖動失真
        .to(
          stamp,
          {
            duration: 0.3,
            ease: "none",
            onUpdate() {
              if (!stamp) return;
              const k = 1 + this.progress() * 4;
              gsap.set(stamp, {
                x: (Math.random() - 0.5) * k * 2.4,
                y: (Math.random() - 0.5) * k,
                skewX: (Math.random() - 0.5) * k * 1.4,
              });
            },
          },
          0.7,
        )
        // 龜裂：一道白線橫過蓋章
        .fromTo(
          crackRef.current,
          { autoAlpha: 0, scaleX: 0 },
          { autoAlpha: 1, scaleX: 1, duration: 0.13, ease: "power4.out" },
          0.8,
        )
        // 低階色兩片蓋上來，畫面被「低階結果」封住
        .to(
          [tearLRef.current, tearRRef.current],
          { autoAlpha: 0.62, duration: 0.16 },
          0.86,
        )
        // 停格：一切靜止，只有裂縫在亮 → 屏息
        .call(() => {
          field.freeze = 1;
        }, undefined, 0.94)
        .to(seamRef.current, { autoAlpha: 1, scaleY: 1, duration: 0.14 }, 0.94);

      // ── C 撕裂：畫面自中央鋸齒撕開，結果色從後面炸出
      // 撕裂段的節奏刻意分成「先看見翻盤、再被爆點蓋章」兩拍：
      // RevealFx 的爆點 canvas 在更上層（z-30），字母若與爆點同時出現會被整個蓋掉，
      // 所以字母先站定（C+0.10），爆點延到 C+0.38 才炸，當成它的落槌。
      // 白閃同理只給一記短促的尖峰，否則整段撕裂會被洗成一片白。
      const C = big ? 1.12 : 1.04; // SSR 多屏息一拍
      jtl
        .call(() => {
          field.freeze = 0;
          field.blast = 1;
          field.drag = 1.7;
          shownFxRef.current = target;
          cb.current.onBoost?.(1);
        }, undefined, C)
        .to(root, { ["--fx-hint" as string]: ffx.color, duration: 0.16, ease: "power4.in" }, C)
        .to(field, { drag: 1, duration: 0.6, ease: "power2.out" }, C + 0.1)
        .call(() => {
          field.surge = 1;
        }, undefined, C + 0.12)
        // 白閃：短促尖峰，讓後面的撕裂看得見
        .fromTo(
          flashRef.current,
          { autoAlpha: 0, backgroundColor: "#ffffff" },
          { autoAlpha: big ? 0.92 : 0.78, duration: 0.05 },
          C,
        )
        .to(flashRef.current, { autoAlpha: 0, duration: 0.16 }, C + 0.05)
        // 兩片低階色被扯開，露出後面已換成結果色的場景
        .to(
          tearLRef.current,
          { x: "-78%", rotation: -3, autoAlpha: 0, duration: 0.52, ease: "power4.out" },
          C + 0.04,
        )
        .to(
          tearRRef.current,
          { x: "78%", rotation: 3, autoAlpha: 0, duration: 0.52, ease: "power4.out" },
          C + 0.04,
        )
        .to(seamRef.current, { autoAlpha: 0, scaleX: 6, duration: 0.32, ease: "power3.out" }, C + 0.02)
        // 蓋章連同裂縫一起碎掉、往鏡頭飛散
        .to(
          [stamp, crackRef.current],
          {
            autoAlpha: 0,
            scale: 2.6,
            rotationZ: 12,
            filter: "blur(6px)",
            duration: 0.3,
            ease: "power3.out",
          },
          C + 0.02,
        )
        .to(vignetteRef.current, { autoAlpha: 0, duration: 0.4 }, C + 0.2)
        // 中央核心讓位給字母（不壓低的話橘字會直接融進橘色光核）
        .to(field, { core: 0.4, duration: 0.16 }, C + 0.06)
        // 結果字母砸進畫面（此時爆點還沒炸，看得清楚）
        .fromTo(slam, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, C + 0.1)
        .fromTo(
          slamInner,
          { scale: big ? 4.2 : 3.2, rotationZ: big ? -8 : -4, filter: "blur(14px)" },
          {
            scale: 1,
            rotationZ: 0,
            filter: "blur(0px)",
            duration: big ? 0.32 : 0.26,
            ease: "back.out(2.4)",
          },
          C + 0.1,
        )
        .fromTo(
          badgeRef.current,
          { scale: 0.86 },
          {
            scale: big ? 1.16 : 1.06,
            duration: 0.14,
            yoyo: true,
            repeat: 1,
            ease: "power2.inOut",
          },
          C + 0.1,
        )
        // 落槌：字母站定後才引爆中央爆點
        .call(() => {
          cb.current.onJump?.(target);
        }, undefined, C + 0.38)
        .to(slamInner, { scale: 1.14, duration: 0.12, ease: "power3.out" }, C + 0.38)
        .to(slamInner, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.4)" }, C + 0.5)
        .fromTo(
          cap,
          { autoAlpha: 0, scale: 1.6, letterSpacing: "1.2em" },
          { autoAlpha: 0.95, scale: 1, letterSpacing: "0.5em", duration: 0.3 },
          C + 0.46,
        );

      // SSR 昇格再補一記餘震
      if (big) {
        jtl.fromTo(
          flashRef.current,
          { autoAlpha: 0, backgroundColor: ffx.spark },
          { autoAlpha: 0.38, duration: 0.08, yoyo: true, repeat: 1 },
          C + 0.62,
        );
      }

      // ── D 餘韻：字母撐到爆點散開才退場，徽章／板塊名回位交回主時間軸
      const D = C + (big ? 1.15 : 1.0);
      jtl
        .to(field, { core: 1, duration: 0.4 }, D)
        .to(slam, { autoAlpha: 0, duration: 0.3 }, D)
        .to(slamInner, { y: -22, scale: 0.86, duration: 0.3 }, D)
        .to(
          [badgeRef.current, nameRef.current, subRef.current],
          { autoAlpha: 1, scale: 1, duration: 0.3 },
          D,
        )
        .to({}, { duration: 0.12 });
    };

    // ── 閘門：結果未到就停在滿蓄力等待，跳變則在此插入整段昇格演出
    const releaseGate = () => {
      if (gateTimer) {
        clearTimeout(gateTimer);
        gateTimer = 0;
      }
      gateRef.current = null;
      if (jumpFromRef.current && !jumpDoneRef.current) {
        playJump(() => {
          // 跳過已由昇格演出完成的預告染色，直接接回收場
          tl.seek(RESUME_AT);
          tl.resume();
        });
        return;
      }
      tl.resume();
    };

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
    tl.call(() => cb.current.onBoost?.(0.25), undefined, 0.2).call(
      () => cb.current.onBoost?.(0.5),
      undefined,
      1.3,
    );

    // 閘門（GATE_AT）
    tl.call(
      () => {
        // 最常見：結果已到且非跳變 → 什麼都不做，照原本節奏走
        if (hintRef.current !== null && !jumpFromRef.current) return;
        tl.pause();
        if (hintRef.current !== null) {
          releaseGate(); // 已知是跳變 → 立刻演昇格
          return;
        }
        // 結果還沒回來：停在滿蓄力等它，逾時則照常收場
        gateRef.current = releaseGate;
        gateTimer = window.setTimeout(releaseGate, GATE_MAX_WAIT_MS);
      },
      undefined,
      GATE_AT,
    );

    // 稀有度預告（彩光）：跳變已自行處理染色，這裡跳過
    tl.call(
      () => {
        if (jumpDoneRef.current) return;
        const h = hintRef.current;
        const fx = h ? RARITY_FX[h] : null;
        cb.current.onBoost?.(fx && fx.tier >= 2 ? 1 : 0.8);
        if (fx && fx.tier >= 2 && rootRef.current) {
          gsap.to(rootRef.current, {
            ["--fx-hint" as string]: fx.color,
            duration: 0.3,
          });
          gsap.fromTo(
            flashRef.current,
            { autoAlpha: 0, backgroundColor: fx.spark },
            { autoAlpha: 0.35, duration: 0.18, yoyo: true, repeat: 3 },
          );
        }
      },
      undefined,
      2.0,
    );

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
      if (gateTimer) clearTimeout(gateTimer);
      gateRef.current = null;
      jumpTlRef.current?.kill();
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

  const lowColor = jumpFrom ? RARITY_FX[jumpFrom].color : theme.accent;
  const highColor = hint ? RARITY_FX[hint].color : theme.accent;

  return (
    <div
      ref={rootRef}
      className="scanlines absolute inset-0 overflow-hidden"
      style={{
        ["--fx-hint" as string]: theme.accent,
        ["--fx-tear" as string]: lowColor,
      }}
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

      {/* ── 跳變（昇格）演出層 ───────────────────────────────── */}

      {/* 低階色兩片：異常段蓋上、撕裂段被扯開 */}
      <div
        ref={tearLRef}
        data-fx="tear-l"
        className="pointer-events-none absolute inset-0 z-20 opacity-0"
        style={{
          clipPath: SEAM_LEFT,
          background:
            "linear-gradient(100deg, color-mix(in srgb, var(--fx-tear) 78%, #05070c), color-mix(in srgb, var(--fx-tear) 30%, #05070c))",
        }}
      />
      <div
        ref={tearRRef}
        className="pointer-events-none absolute inset-0 z-20 opacity-0"
        style={{
          clipPath: SEAM_RIGHT,
          background:
            "linear-gradient(260deg, color-mix(in srgb, var(--fx-tear) 78%, #05070c), color-mix(in srgb, var(--fx-tear) 30%, #05070c))",
        }}
      />

      {/* 暗角：疊在兩片之上才看得到（否則被低階色蓋掉），異常段收攏視野 */}
      <div
        ref={vignetteRef}
        className="pointer-events-none absolute inset-0 z-20 opacity-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 46% at 50% 50%, transparent 28%, rgba(0,0,0,0.94) 100%)",
        }}
      />

      {/* 撕裂縫：停格時亮起，撕開瞬間橫向炸散 */}
      <div
        ref={seamRef}
        data-fx="seam"
        className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-[3px] origin-center -translate-x-1/2 scale-y-0 opacity-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent, #ffffff 12%, #ffffff 88%, transparent)",
          boxShadow: "0 0 40px 8px rgba(255,255,255,0.85)",
        }}
      />

      {/* 假結局的稀有度蓋章 */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
        <div
          ref={stampRef}
          data-fx="stamp"
          className="relative text-[7rem] font-black leading-none tracking-tight opacity-0"
          style={{
            color: lowColor,
            textShadow: `0 0 40px ${lowColor}, 0 0 110px color-mix(in srgb, ${lowColor} 60%, transparent)`,
          }}
        >
          {jumpFrom}
          {/* 龜裂：橫過蓋章的白線 */}
          <span
            ref={crackRef}
            className="absolute left-0 top-1/2 block h-[3px] w-full origin-left opacity-0"
            style={{
              background:
                "linear-gradient(90deg, transparent, #ffffff 20%, #ffffff 80%, transparent)",
              boxShadow: "0 0 18px 3px rgba(255,255,255,0.9)",
              transform: "translateY(-50%) rotate(-6deg)",
            }}
          />
        </div>
        <div
          ref={capLowRef}
          className="text-xs tracking-[0.5em] text-white/70 opacity-0"
        >
          判定完成
        </div>
      </div>

      {/* 昇格後的結果字母：白字＋稀有度色描邊＋暗底盤。
          爆點與能量核心都是同色系的強光，純色字會直接被吃掉，必須靠明度反差站住。 */}
      <div
        ref={slamRef}
        data-fx="slam"
        className="pointer-events-none absolute inset-0 z-20 opacity-0"
      >
        {/* 暗底盤不跟著砸落縮放，否則放大期間會把整個撕裂畫面壓黑 */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[26rem] w-[34rem] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(4,6,10,0.82) 0%, rgba(4,6,10,0.5) 42%, transparent 72%)",
          }}
        />
        <div
          ref={slamInnerRef}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4"
        >
          <div
            className="text-[8.5rem] font-black leading-none tracking-tight text-white"
            style={{
              WebkitTextStroke: `3px ${highColor}`,
              paintOrder: "stroke fill",
              textShadow: `0 0 24px ${highColor}, 0 0 70px ${highColor}, 0 0 160px color-mix(in srgb, ${highColor} 75%, transparent)`,
            }}
          >
            {hint}
          </div>
          <div
            ref={capHighRef}
            className="text-sm font-black tracking-[0.5em] text-white opacity-0"
            style={{ textShadow: `0 0 16px ${highColor}, 0 0 40px ${highColor}` }}
          >
            {hint === "SSR" ? "規格外" : "昇格"}
          </div>
        </div>
      </div>

      {/* 白閃 */}
      <div ref={flashRef} className="pointer-events-none absolute inset-0 z-30 opacity-0" />
    </div>
  );
}
