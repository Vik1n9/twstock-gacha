"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { CardBack } from "./CardBack";
import { StockCardFace } from "@/components/cards/StockCard";
import type { DrawCard } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";

// 翻牌容器：卡背 → 翻轉 → 卡面（rotationY，preserve-3d）
export function FlipCard({
  card,
  theme,
  boardName,
  size = 110,
  delay = 0,
  low = false,
  onFlipped,
}: {
  card: DrawCard;
  theme: SectorTheme;
  boardName?: string | null;
  size?: number;
  delay?: number;
  low?: boolean;
  onFlipped?: () => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const flippedRef = useRef(onFlipped);

  useEffect(() => {
    flippedRef.current = onFlipped;
  }, [onFlipped]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    if (low) {
      gsap.set(inner, { rotationY: 180 });
      flippedRef.current?.();
      return;
    }

    const tl = gsap.timeline({ delay });
    tl.to(inner, {
      rotationY: 180,
      duration: 0.65,
      ease: "power2.inOut",
      onComplete: () => flippedRef.current?.(),
    });
    if (card.rarity === "SSR") {
      tl.fromTo(
        glowRef.current,
        { autoAlpha: 0, scale: 0.8 },
        { autoAlpha: 1, scale: 1.15, duration: 0.3, ease: "power2.out" },
      ).to(glowRef.current, { autoAlpha: 0.35, scale: 1, duration: 0.4 });
    }
    return () => {
      tl.kill();
    };
  }, [low, delay, card.rarity]);

  return (
    <div
      className="relative"
      style={{ width: size, height: size * 1.12, perspective: 700 }}
    >
      <div
        ref={innerRef}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* 正面：卡背（翻轉前） */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className="flex h-full items-center justify-center">
            <CardBack theme={theme} size={size} />
          </div>
        </div>
        {/* 背面：卡面（翻轉後） */}
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <StockCardFace card={card} boardName={boardName} compact />
        </div>
      </div>
      {/* SSR 光暈底層 */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute -inset-3 rounded-xl opacity-0"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--gold) 40%, transparent), transparent)",
        }}
      />
    </div>
  );
}
