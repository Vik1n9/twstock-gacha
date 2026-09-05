"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";

// 企劃書 15.3 板塊共振（結果總覽層）
// alpha 以同方向計數：5+ 共振光環＋旋轉符文環、8+ 全屏掃光＋光柵柱＋邊框脈動
export function Resonance({
  sameCount,
  theme,
  low,
}: {
  sameCount: number;
  theme: SectorTheme;
  low: boolean;
}) {
  const haloRef = useRef<HTMLDivElement>(null);
  const runeRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (low) return;
    const ctx = gsap.context(() => {
      if (sameCount >= 5) {
        gsap
          .timeline()
          .fromTo(
            haloRef.current,
            { autoAlpha: 0, scale: 0.65 },
            { autoAlpha: 1, scale: 1, duration: 0.9, ease: "power3.out" },
          )
          .to(haloRef.current, {
            autoAlpha: 0.55,
            scale: 1.07,
            duration: 1.7,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
          });
        gsap.fromTo(
          runeRef.current,
          { autoAlpha: 0, scale: 1.4, rotation: -40 },
          { autoAlpha: 0.5, scale: 1, rotation: 0, duration: 1.1, ease: "power3.out" },
        );
        gsap.to(runeRef.current, {
          rotation: "+=360",
          duration: 26,
          ease: "none",
          repeat: -1,
        });
      }
      if (sameCount >= 8) {
        gsap.fromTo(
          sweepRef.current,
          { xPercent: -140, autoAlpha: 1 },
          { xPercent: 140, duration: 1.05, ease: "power2.inOut", delay: 0.2 },
        );
        gsap.fromTo(
          barsRef.current?.children ?? [],
          { scaleY: 0, autoAlpha: 0 },
          {
            scaleY: 1,
            autoAlpha: 0.55,
            duration: 0.55,
            stagger: 0.05,
            ease: "power3.out",
            yoyo: true,
            repeat: 1,
            repeatDelay: 0.5,
          },
        );
        gsap.fromTo(
          frameRef.current,
          { autoAlpha: 0 },
          {
            autoAlpha: 0.8,
            duration: 0.5,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
          },
        );
      }
    });
    return () => ctx.revert();
  }, [sameCount, low]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 共振光環（5+） */}
      <div
        ref={haloRef}
        className="absolute left-1/2 top-1/2 aspect-square w-[135%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
        style={{
          background: `radial-gradient(closest-side, transparent 52%, color-mix(in srgb, ${theme.primary} 28%, transparent) 70%, transparent 86%)`,
        }}
      />
      {/* 旋轉符文環（5+） */}
      <div
        ref={runeRef}
        className="absolute left-1/2 top-1/2 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
        style={{
          border: `1px dashed color-mix(in srgb, ${theme.accent} 55%, transparent)`,
          boxShadow: `0 0 60px color-mix(in srgb, ${theme.primary} 30%, transparent) inset`,
        }}
      />
      {/* 光柵柱（8+） */}
      <div ref={barsRef} className="absolute inset-0 flex justify-between px-[6%]">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-full w-[2px] origin-bottom opacity-0"
            style={{
              background: `linear-gradient(to top, color-mix(in srgb, ${theme.accent} 70%, transparent), transparent)`,
            }}
          />
        ))}
      </div>
      {/* 全屏掃光（8+） */}
      <div
        ref={sweepRef}
        className="absolute inset-y-0 left-0 w-1/3 opacity-0"
        style={{
          background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${theme.accent} 42%, transparent), transparent)`,
        }}
      />
      {/* 邊框脈動（8+） */}
      <div
        ref={frameRef}
        className="absolute inset-2 rounded-2xl opacity-0"
        style={{
          boxShadow: `inset 0 0 90px color-mix(in srgb, ${theme.primary} 45%, transparent)`,
        }}
      />
    </div>
  );
}
