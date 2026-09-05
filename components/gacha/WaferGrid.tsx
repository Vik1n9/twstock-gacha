"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { FlipCard } from "./FlipCard";
import type { DrawCard } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";

// 企劃書 15.2：十連卡背以板塊主題排列（SEMI=晶圓格：中央 1 + 環形 9）
// alpha 共振調整（註）：企劃書 15.3 以「同板塊」計數，板塊池內恆成立，
// 故 alpha 以同方向計數實作（3/5/8 階），beta 全市場池改回同板塊。
const RING = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 - Math.PI / 2;
  return {
    x: 50 + 37 * Math.cos(a),
    y: 47 + 37 * Math.sin(a),
  };
});

export function WaferGrid({
  cards,
  theme,
  boardName,
  low,
  onDone,
}: {
  cards: DrawCard[];
  theme: SectorTheme;
  boardName: string | null;
  low: boolean;
  onDone: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [flippedAll, setFlippedAll] = useState(false);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const ten = cards.slice(0, 10);
  const positions = [ { x: 50, y: 47 }, ...RING ];

  useEffect(() => {
    if (!flippedAll) return;
    // 翻完後：同方向 ≥3 邊框微光
    const ctx = gsap.context(() => {
      const up = ten.filter((c) => c.direction === "UP").length;
      const dir = up >= ten.length - up ? "UP" : "DOWN";
      const majority = ten.filter((c) => c.direction === dir).length;
      if (majority >= 3) {
        gsap.fromTo(
          rootRef.current!.querySelectorAll(`[data-dir="${dir}"]`),
          { boxShadow: "0 0 0px rgba(255,255,255,0)" },
          {
            boxShadow: `0 0 22px ${dir === "UP" ? "rgba(255,82,82,0.55)" : "rgba(38,166,154,0.55)"}`,
            duration: 0.6,
            yoyo: true,
            repeat: 3,
          },
        );
      }
    }, rootRef);
    const t = setTimeout(() => doneRef.current(), 1400);
    return () => {
      ctx.revert();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flippedAll]);

  const totalFlipMs = low ? 150 : (0.16 * 9 + 0.75 + 0.15) * 1000;

  useEffect(() => {
    const t = setTimeout(() => setFlippedAll(true), totalFlipMs);
    return () => clearTimeout(t);
  }, [totalFlipMs]);

  return (
    <div ref={rootRef} className="relative mx-auto h-[520px] w-full max-w-xl">
      {ten.map((card, i) => {
        const pos = positions[i] ?? positions[0];
        return (
          <div
            key={`${card.stockCode}-${i}`}
            data-dir={card.direction}
            className="absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <FlipCard
              card={card}
              theme={theme}
              boardName={boardName}
              size={88}
              delay={low ? 0 : i === 0 ? 0 : 0.16 * i}
              low={low}
            />
          </div>
        );
      })}
    </div>
  );
}
