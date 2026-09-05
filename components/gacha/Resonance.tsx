"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";

// 企劃書 15.3 板塊共振（結果總覽層）
// alpha 以同方向計數：5+ 共振光環、8+ 全屏特效；3+ 卡面微光在 WaferGrid 內
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
  const sweepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (low) return;
    const ctx = gsap.context(() => {
      if (sameCount >= 5) {
        gsap.fromTo(
          haloRef.current,
          { autoAlpha: 0, scale: 0.8 },
          { autoAlpha: 1, scale: 1, duration: 0.8, ease: "power2.out" },
        );
        gsap.to(haloRef.current, {
          autoAlpha: 0.55,
          scale: 1.06,
          duration: 1.6,
          yoyo: true,
          repeat: -1,
          delay: 0.8,
        });
      }
      if (sameCount >= 8) {
        gsap.fromTo(
          sweepRef.current,
          { xPercent: -120 },
          { xPercent: 120, duration: 0.9, ease: "power2.inOut", delay: 0.25 },
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
        className="absolute left-1/2 top-1/2 aspect-square w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
        style={{
          background: `radial-gradient(closest-side, transparent 55%, color-mix(in srgb, ${theme.primary} 22%, transparent) 72%, transparent 85%)`,
        }}
      />
      {/* 全屏掃光（8+） */}
      <div
        ref={sweepRef}
        className="absolute inset-y-0 left-0 w-1/3 opacity-0"
        style={{
          background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${theme.accent} 30%, transparent), transparent)`,
        }}
      />
    </div>
  );
}
