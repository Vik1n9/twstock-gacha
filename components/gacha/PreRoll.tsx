"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { SectorTheme } from "@/lib/sectors/defs";

// 企劃書 13.1 抽卡前置演出 5 步驟：
// 1 板塊徽章 2 行情掃碼板塊名 3 主題背景（由 SectorBackdrop 承擔）
// 4 股票代號快速流動 5 進入抽卡流程
export function PreRoll({
  theme,
  boardName,
  stockCodes,
  low,
  onDone,
}: {
  theme: SectorTheme;
  boardName: string;
  stockCodes: string[];
  low: boolean;
  onDone: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (low) {
      // 低特效：直接進入抽卡
      const t = setTimeout(() => doneRef.current(), 250);
      return () => clearTimeout(t);
    }

    const root = rootRef.current;
    if (!root) return;

    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.fromTo(
      badgeRef.current,
      { autoAlpha: 0, scale: 0.55, rotation: -12 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.55, ease: "back.out(1.7)" },
    )
      .fromTo(
        nameRef.current,
        { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power2.inOut" },
        "-=0.15",
      )
      .fromTo(
        subRef.current,
        { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.4 },
        "-=0.25",
      )
      .to(badgeRef.current, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1 })
      // 演出收場：整層淡出交棒
      .to(
        [badgeRef.current, nameRef.current, subRef.current],
        { autoAlpha: 0, y: -14, duration: 0.35, stagger: 0.05 },
        "+=0.15",
      )
      .add(() => doneRef.current(), "-=0.1");

    // 代號流動（獨立循環）
    const marquee = gsap.to(tickerRef.current, {
      xPercent: -50,
      ease: "none",
      duration: 9,
      repeat: -1,
    });

    return () => {
      tl.kill();
      marquee.kill();
    };
  }, [low]);

  const codes = stockCodes.slice(0, 24).join("　·　");

  return (
    <div ref={rootRef} className="absolute inset-0 flex items-center justify-center">
      {/* 代號流動背景帶 */}
      <div className="absolute left-0 top-1/2 w-[200%] -translate-y-1/2 overflow-hidden">
        <div
          ref={tickerRef}
          className="whitespace-nowrap font-mono text-sm tracking-[0.35em] opacity-25"
          style={{ color: theme.accent }}
        >
          {codes}　·　{codes}　·　
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* 板塊徽章 */}
        <div ref={badgeRef} className="invisible">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-2xl text-3xl font-black"
            style={{
              background: `linear-gradient(150deg, color-mix(in srgb, ${theme.primary} 35%, #10131a), #0c0e14)`,
              border: `2px solid ${theme.accent}`,
              color: theme.accent,
              boxShadow: `0 0 34px color-mix(in srgb, ${theme.primary} 45%, transparent)`,
            }}
          >
            ▤
          </div>
        </div>

        <div
          ref={nameRef}
          className="text-4xl font-black tracking-[0.3em]"
          style={{ color: theme.primary, textShadow: `0 0 24px color-mix(in srgb, ${theme.primary} 60%, transparent)` }}
        >
          {boardName}
        </div>

        <div ref={subRef} className="invisible text-sm dim">
          正在進入板塊卡池…
        </div>
      </div>
    </div>
  );
}
