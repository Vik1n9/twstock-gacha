"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { CardBack } from "./CardBack";
import { StockCardFace } from "@/components/cards/StockCard";
import type { DrawCard } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { RARITY_FX } from "@/lib/fx/core";

// 翻牌容器（真 3D）：
// 遠處飛入 → 高稀有度蓄力抖動 → 帶弧線的 rotationY 翻轉 → 落定回彈 → 稀有度光暈常駐
// 翻開瞬間回呼 onImpact(螢幕座標, 稀有度)，由 RevealFx 在上層丟爆點。
//
// 跳變卡（card.jumpFrom）：蓄力全程都用低階色（連背景都是，見 GachaStage 送給
// PreRoll 的假 hint），玩家一路以為只有 R；卡背開始轉向的那一刻才色轉變——低階
// 光暈退場、低階→結果色刷過卡背，並以 onJumpShift 通知上層把背景換成結果色。
// 轉色之後就是該稀有度「正常的出場畫面」，不再有額外的昇格段落。
export function FlipCard({
  card,
  theme,
  boardName,
  size = 110,
  delay = 0,
  low = false,
  onFlipped,
  onImpact,
  onJumpShift,
  interactive = true,
}: {
  card: DrawCard;
  theme: SectorTheme;
  boardName?: string | null;
  size?: number;
  delay?: number;
  low?: boolean;
  onFlipped?: () => void;
  onImpact?: (x: number, y: number, rarity: DrawCard["rarity"]) => void;
  // 跳變卡的卡背轉向瞬間：上層把背景由低階色換成結果色
  onJumpShift?: (rarity: DrawCard["rarity"]) => void;
  interactive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const jumpAuraRef = useRef<HTMLDivElement>(null);
  const jumpFlashRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onFlipped, onImpact, onJumpShift });
  const jumpFrom = card.jumpFrom ?? null;
  const lfx = jumpFrom ? RARITY_FX[jumpFrom] : null;

  useEffect(() => {
    cbRef.current = { onFlipped, onImpact, onJumpShift };
  }, [onFlipped, onImpact, onJumpShift]);

  useEffect(() => {
    const inner = innerRef.current;
    const tilt = tiltRef.current;
    const wrap = wrapRef.current;
    const aura = auraRef.current;
    const jumpAura = jumpAuraRef.current;
    const jumpFlash = jumpFlashRef.current;
    const ring = ringRef.current;
    if (!inner || !tilt || !wrap) return;

    const fx = RARITY_FX[card.rarity];

    if (low) {
      gsap.set(inner, { rotationY: 180 });
      gsap.set([tilt, wrap], { autoAlpha: 1, scale: 1 });
      gsap.set(aura, { autoAlpha: 0.35 });
      cbRef.current.onFlipped?.();
      return;
    }

    const fireImpact = () => {
      const r = wrap.getBoundingClientRect();
      cbRef.current.onImpact?.(
        r.left + r.width / 2,
        r.top + r.height / 2,
        card.rarity,
      );
    };

    const tl = gsap.timeline({ delay });

    // 1) 從深處飛入並落位
    tl.fromTo(
      tilt,
      { autoAlpha: 0, z: -900, rotationX: 42, rotationZ: -14, y: 70 },
      {
        autoAlpha: 1,
        z: 0,
        rotationX: 0,
        rotationZ: 0,
        y: 0,
        duration: 0.62,
        ease: "power3.out",
      },
    );

    // 2) 高稀有度蓄力：卡背抖動 + 光暈爬升（把期待感撐開）
    //    跳變卡：蓄力光暈改用低階色（前兆），翻轉起手才交棒給結果色
    if (fx.tier >= 2) {
      tl.to(
        jumpFrom && jumpAura ? jumpAura : aura,
        { autoAlpha: 0.9, scale: 1.35, duration: 0.5, ease: "power2.in" },
        "-=0.15",
      ).to(
        tilt,
        {
          x: "+=0",
          duration: 0.42,
          ease: "none",
          onUpdate() {
            const k = fx.tier >= 3 ? 5 : 2.5;
            gsap.set(tilt, {
              x: (Math.random() - 0.5) * k,
              y: (Math.random() - 0.5) * k,
            });
          },
          onComplete: () => gsap.set(tilt, { x: 0, y: 0 }),
        },
        "<",
      );
    }

    // 3) 翻轉：帶前推弧線與輕微 X 軸擺動，避免死板的平面翻牌
    tl.to(inner, {
      rotationY: 180,
      duration: 0.72,
      ease: "power2.inOut",
      onStart: () => {
        // 卡背轉向＝跳變的觸發點：低階色在這一刻讓位給結果色
        if (jumpFrom) {
          cbRef.current.onJumpShift?.(card.rarity);
          if (jumpAura) {
            gsap.to(jumpAura, {
              autoAlpha: 0,
              scale: 1.6,
              duration: 0.3,
              ease: "power2.out",
            });
          }
          if (jumpFlash) {
            // 低階→結果色刷過卡背：色轉變本身就是這張卡的「昇格」訊號
            gsap.fromTo(
              jumpFlash,
              { autoAlpha: 0, scaleY: 0.3 },
              { autoAlpha: 0.62, scaleY: 1, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.in" },
            );
          }
          // 結果色光暈提前接手，翻到一半就看得出顏色換了
          gsap.to(aura, { autoAlpha: 0.6, scale: 1.3, duration: 0.34, ease: "power2.out" });
        }
        gsap.to(inner, {
          z: size * 0.9,
          rotationX: -12,
          duration: 0.36,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        });
      },
      onComplete: () => {
        fireImpact();
        cbRef.current.onFlipped?.();
      },
    });

    // 4) 落定回彈 + 稀有度光環擴散（跳變卡轉色後走的就是這條正常路徑）
    tl.fromTo(
      tilt,
      { scale: 1 },
      { scale: 1.1, duration: 0.16, ease: "power2.out" },
    )
      .to(tilt, { scale: 1, duration: 0.42, ease: "elastic.out(1, 0.5)" })
      .fromTo(
        ring,
        { autoAlpha: 0.9, scale: 0.5 },
        { autoAlpha: 0, scale: 2.9, duration: 0.75, ease: "power2.out" },
        "<",
      )
      .to(
        aura,
        { autoAlpha: 0.14 + fx.tier * 0.12, scale: 1, duration: 0.5 },
        "<",
      );

    // 5) 常駐呼吸：光暈與卡面極輕微浮動
    tl.to(aura, {
      autoAlpha: `+=${0.08 + fx.tier * 0.05}`,
      scale: 1.08,
      duration: 1.5,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    }).to(
      tilt,
      { y: -4, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" },
      "<",
    );

    return () => {
      tl.kill();
      gsap.killTweensOf([inner, tilt, aura, ring, jumpAura, jumpFlash]);
    };
  }, [low, delay, card.rarity, jumpFrom, size]);

  // 指標傾斜：滑過卡片時做出實體卡的視差與反光
  useEffect(() => {
    if (low || !interactive) return;
    const wrap = wrapRef.current;
    const tilt = tiltRef.current;
    if (!wrap || !tilt) return;

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(tilt, {
        rotationY: px * 22,
        rotationX: -py * 22,
        duration: 0.4,
        ease: "power2.out",
        overwrite: "auto",
      });
      wrap.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
      wrap.style.setProperty("--my", `${(py + 0.5) * 100}%`);
    };
    const onLeave = () => {
      gsap.to(tilt, { rotationY: 0, rotationX: 0, duration: 0.7, ease: "power3.out" });
    };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, [low, interactive]);

  const fx = RARITY_FX[card.rarity];

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={
        {
          width: size,
          height: size * 1.4,
          perspective: 1100,
          "--mx": "50%",
          "--my": "50%",
        } as React.CSSProperties
      }
    >
      {/* 稀有度光暈（底層） */}
      <div
        ref={auraRef}
        className="pointer-events-none absolute -inset-6 opacity-0"
        style={{
          background: `radial-gradient(closest-side, ${fx.color}, transparent 72%)`,
          filter: `blur(${10 + fx.tier * 8}px)`,
        }}
      />

      {/* 跳變偽裝光暈（低階色，蓄力期代替結果色光暈） */}
      <div
        ref={jumpAuraRef}
        className="pointer-events-none absolute -inset-6 opacity-0"
        style={
          lfx
            ? {
                background: `radial-gradient(closest-side, ${lfx.color}, transparent 72%)`,
                filter: `blur(${10 + lfx.tier * 8}px)`,
              }
            : undefined
        }
      />

      {/* 翻開瞬間的擴散光環（在卡片後方，避免蓋住卡面） */}
      <div
        ref={ringRef}
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-full -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 mix-blend-screen"
        style={{
          border: `1.5px solid ${fx.color}`,
          boxShadow: `0 0 30px ${fx.color}`,
        }}
      />

      <div
        ref={tiltRef}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          ref={innerRef}
          className="relative h-full w-full"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* 正面：卡背（翻轉前） */}
          <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
            <div className="flex h-full items-center justify-center">
              <CardBack theme={theme} size={size} charged={fx.tier >= 2} />
            </div>
          </div>
          {/* 背面：卡面（翻轉後） */}
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <StockCardFace
              card={card}
              boardName={boardName}
              variant={size < 132 ? "mini" : size < 200 ? "compact" : "full"}
            />
            {/* 跟隨指標的鏡面反光 */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[14px] mix-blend-screen"
              style={{
                background: `radial-gradient(180px 180px at var(--mx) var(--my), rgba(255,255,255,0.22), transparent 62%)`,
              }}
            />
          </div>
          {/* 跳變轉色閃刷：卡背轉向瞬間由低階色刷向結果色（與卡片同層傾斜） */}
          <div
            ref={jumpFlashRef}
            className="pointer-events-none absolute inset-0 z-10 rounded-[14px] opacity-0 mix-blend-screen"
            style={
              lfx
                ? { background: `linear-gradient(155deg, ${lfx.color}, ${fx.color})` }
                : undefined
            }
          />
        </div>
      </div>

    </div>
  );
}
