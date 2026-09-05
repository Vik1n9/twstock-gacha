"use client";

import type { SectorTheme } from "@/lib/sectors/defs";

// 卡背：晶圓晶粒造型（SEMI 主題）
// 多層堆疊：金屬底 → 電路蝕刻 → 同心晶圓環 → 全息斜掃 → 邊緣光 → 中央徽記
export function CardBack({
  theme,
  size = 110,
  /** 抽卡前置預告：拉高整體亮度與掃光速度 */
  charged = false,
}: {
  theme: SectorTheme;
  size?: number;
  charged?: boolean;
}) {
  const cut = Math.max(7, size * 0.07);
  return (
    <div
      className="card-back relative overflow-hidden"
      style={
        {
          width: size,
          height: size * 1.4,
          borderRadius: size * 0.075,
          "--cb-primary": theme.primary,
          "--cb-accent": theme.accent,
          background: `
            linear-gradient(155deg,
              color-mix(in srgb, ${theme.primary} 34%, #0b0e14) 0%,
              #0a0c12 46%,
              color-mix(in srgb, ${theme.primary} 18%, #080a10) 100%)`,
          border: `1px solid color-mix(in srgb, ${theme.accent} 42%, transparent)`,
          boxShadow: `
            inset 0 0 ${size * 0.3}px color-mix(in srgb, ${theme.primary} 30%, transparent),
            inset 0 1px 0 color-mix(in srgb, ${theme.accent} 35%, transparent),
            0 ${size * 0.09}px ${size * 0.22}px rgba(0,0,0,0.65)`,
        } as React.CSSProperties
      }
    >
      {/* 電路蝕刻底紋 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(${theme.primary} 1px, transparent 1px),
            linear-gradient(90deg, ${theme.primary} 1px, transparent 1px)`,
          backgroundSize: `${size * 0.13}px ${size * 0.13}px`,
          opacity: 0.16,
          maskImage: "radial-gradient(closest-side, #000 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(closest-side, #000 40%, transparent 100%)",
        }}
      />

      {/* 同心晶圓環 */}
      {[0.86, 0.62, 0.4].map((k) => (
        <div
          key={k}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: size * k,
            height: size * k,
            transform: "translate(-50%, -50%)",
            border: `1px solid color-mix(in srgb, ${theme.accent} ${18 + k * 22}%, transparent)`,
            opacity: 0.65,
          }}
        />
      ))}

      {/* 全息斜掃 */}
      <div
        className="card-back-holo absolute inset-0"
        style={{ animationDuration: charged ? "1.1s" : "3.4s" }}
      />

      {/* 晶粒切角 */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: 0,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: `${cut}px solid transparent`,
          borderRight: `${cut}px solid transparent`,
          borderTop: `${cut}px solid ${theme.accent}`,
          filter: `drop-shadow(0 0 ${cut}px ${theme.accent})`,
          opacity: 0.9,
        }}
      />

      {/* 中央徽記 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="card-back-sigil flex items-center justify-center font-black"
          style={{
            width: size * 0.34,
            height: size * 0.34,
            fontSize: size * 0.15,
            borderRadius: size * 0.05,
            border: `1.5px solid ${theme.accent}`,
            color: theme.accent,
            background: `radial-gradient(closest-side, color-mix(in srgb, ${theme.primary} 45%, transparent), transparent)`,
            boxShadow: `0 0 ${size * 0.18}px color-mix(in srgb, ${theme.accent} 60%, transparent)`,
            animationDuration: charged ? "0.7s" : "2.2s",
          }}
        >
          ▤
        </div>
      </div>

      {/* 底部條碼裝飾 */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end gap-[2px] px-2 pb-2 opacity-50"
        style={{ height: size * 0.16 }}
      >
        {[3, 7, 4, 9, 2, 6, 8, 3, 5, 7].map((v, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ height: `${v * 10}%`, background: theme.accent, opacity: 0.5 }}
          />
        ))}
      </div>

      {/* 邊緣受光 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: "inherit",
          background: `linear-gradient(160deg, color-mix(in srgb, #ffffff 16%, transparent), transparent 38%)`,
        }}
      />
    </div>
  );
}
