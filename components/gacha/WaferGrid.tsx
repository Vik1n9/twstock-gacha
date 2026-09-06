"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { FlipCard } from "./FlipCard";
import type { DrawCard } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { RARITY_FX, RARITY_RANK, type Rarity } from "@/lib/fx/core";

// 企劃書 15.2：十連卡背以板塊主題排列（SEMI＝晶圓格：中央 1 + 環形 9）
// 演出升級：整片晶圓落在傾斜的 3D 平面上，卡片依序翻開，
// 最高稀有度那張刻意留到最後（壓軸），並吃到更長的蓄力與更重的爆點。
const RING = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + 34 * Math.cos(a), y: 48 + 34 * Math.sin(a) };
});

const STEP = 0.34; // 每張卡翻牌間隔（秒）

export function WaferGrid({
  cards,
  theme,
  boardName,
  low,
  onDone,
  onImpact,
  onBoost,
}: {
  cards: DrawCard[];
  theme: SectorTheme;
  boardName: string | null;
  low: boolean;
  onDone: () => void;
  onImpact?: (x: number, y: number, rarity: Rarity) => void;
  onBoost?: (v: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const [flippedAll, setFlippedAll] = useState(false);
  const cb = useRef({ onDone, onBoost });

  useEffect(() => {
    cb.current = { onDone, onBoost };
  }, [onDone, onBoost]);

  const ten = useMemo(() => cards.slice(0, 10), [cards]);
  const positions = useMemo(() => [{ x: 50, y: 48 }, ...RING], []);

  // 翻牌順序：稀有度低的先翻，最高的壓軸；壓軸前多留一拍
  const schedule = useMemo(() => {
    const order = ten
      .map((c, i) => ({ i, rank: RARITY_RANK[c.rarity] }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i);
    const delays = new Array<number>(ten.length).fill(0);
    let t = 0.35;
    order.forEach((o, k) => {
      const isFinale = k === order.length - 1;
      const rank = o.rank;
      if (isFinale && rank >= 2) t += 0.75; // 壓軸留白
      delays[o.i] = t;
      t += STEP + (rank >= 2 ? 0.5 : 0) + (rank >= 3 ? 0.6 : 0);
    });
    return { delays, total: t + 0.9 };
  }, [ten]);

  const totalMs = low ? 150 : schedule.total * 1000;

  // 整片晶圓：緩慢的 3D 擺盪，讓平面有「浮在空間裡」的體感
  useEffect(() => {
    if (low) return;
    const plane = planeRef.current;
    if (!plane) return;
    const tl = gsap.timeline();
    tl.fromTo(
      plane,
      { rotationX: 46, z: -700, autoAlpha: 0 },
      { rotationX: 12, z: 0, autoAlpha: 1, duration: 1.1, ease: "power3.out" },
    ).to(plane, {
      rotationX: 6,
      rotationY: 5,
      duration: 4,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
    return () => {
      tl.kill();
    };
  }, [low]);

  useEffect(() => {
    const t = setTimeout(() => setFlippedAll(true), totalMs);
    return () => clearTimeout(t);
  }, [totalMs]);

  useEffect(() => {
    if (!flippedAll) return;
    const root = rootRef.current;
    if (!root) return;
    // 翻完後：同方向 ≥3，該方向卡片邊框共振發光
    const ctx = gsap.context(() => {
      const up = ten.filter((c) => c.direction === "UP").length;
      const dir = up >= ten.length - up ? "UP" : "DOWN";
      const majority = ten.filter((c) => c.direction === dir).length;
      if (majority >= 3 && !low) {
        cb.current.onBoost?.(0.55);
        gsap.fromTo(
          root.querySelectorAll(`[data-dir="${dir}"]`),
          { filter: "drop-shadow(0 0 0px rgba(255,255,255,0))" },
          {
            filter: `drop-shadow(0 0 26px ${
              dir === "UP" ? "rgba(255,82,82,0.75)" : "rgba(38,166,154,0.75)"
            })`,
            duration: 0.55,
            yoyo: true,
            repeat: 3,
            stagger: 0.05,
          },
        );
      }
    }, rootRef);
    const t = setTimeout(() => cb.current.onDone(), low ? 100 : 1500);
    return () => {
      ctx.revert();
      clearTimeout(t);
    };
  }, [flippedAll, low, ten]);

  return (
    <div
      ref={rootRef}
      className="relative mx-auto h-[560px] w-full max-w-2xl"
      style={{ perspective: 1400 }}
    >
      <div
        ref={planeRef}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* 晶圓底盤 */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            border: `1px solid color-mix(in srgb, ${theme.accent} 30%, transparent)`,
            background: `radial-gradient(closest-side, color-mix(in srgb, ${theme.primary} 12%, transparent), transparent 72%)`,
            boxShadow: `inset 0 0 90px color-mix(in srgb, ${theme.primary} 22%, transparent)`,
            transform: "translate(-50%, -50%) translateZ(-60px)",
          }}
        />

        {ten.map((card, i) => {
          const pos = positions[i] ?? positions[0];
          const fx = RARITY_FX[card.rarity];
          return (
            <div
              key={`${card.stockCode}-${i}`}
              data-dir={card.direction}
              className="absolute"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) translateZ(${fx.tier >= 3 ? 70 : fx.tier * 16}px)`,
                transformStyle: "preserve-3d",
                zIndex: 10 + fx.tier,
              }}
            >
              <FlipCard
                card={card}
                theme={theme}
                boardName={card.boardName ?? boardName}
                size={92}
                delay={low ? 0 : schedule.delays[i]}
                low={low}
                onImpact={onImpact}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
