"use client";

import type { SectorTheme } from "@/lib/sectors/defs";

// 卡背：晶圓晶粒造型（SEMI 主題；beta 依 sector theme 換造型）
export function CardBack({
  theme,
  size = 110,
}: {
  theme: SectorTheme;
  size?: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={{
        width: size,
        height: size * 1.06,
        background: `linear-gradient(150deg, color-mix(in srgb, ${theme.primary} 30%, #0d1018), #0b0d12)`,
        border: `1px solid color-mix(in srgb, ${theme.accent} 45%, transparent)`,
        boxShadow: `inset 0 0 24px color-mix(in srgb, ${theme.primary} 25%, transparent)`,
      }}
    >
      {/* 晶粒切角 */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: 0,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: `7px solid ${theme.accent}`,
          opacity: 0.8,
        }}
      />
      {/* 電路紋 */}
      <div
        className="absolute inset-2 opacity-40"
        style={{
          backgroundImage: `linear-gradient(${theme.primary} 1px, transparent 1px), linear-gradient(90deg, ${theme.primary} 1px, transparent 1px)`,
          backgroundSize: "14px 14px",
          opacity: 0.18,
        }}
      />
      {/* 中央徽記 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-md text-[11px] font-black"
          style={{
            border: `1.5px solid ${theme.accent}`,
            color: theme.accent,
            boxShadow: `0 0 12px color-mix(in srgb, ${theme.accent} 40%, transparent)`,
          }}
        >
          ▤
        </div>
      </div>
    </div>
  );
}
