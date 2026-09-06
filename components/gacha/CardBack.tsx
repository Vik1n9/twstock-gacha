"use client";

import { useId } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";

// 卡背 v3：證券雕版（鈔票防偽紋風格・高對比雙色版）
// 外框：三重主框 ＋ 扇貝邊飾帶 ＋ 邊飾中點鑽 ＋ 四角扇形飾 ＋ 角鑽
// 底紋：45° 交織網紋 ＋ 36 道放射線
// 內域：左右價位刻度（節標點）、電路走線與焊墊、固定星點
// 中央：刻度環與方位鑽 ＋ 三層扭索羅紋 ＋ 花瓣曼陀羅 ＋ 雙向旋轉環
//        ＋ 深色底盤上的菱形 K 線徽記（光暈壓低避免糊化細紋）
// 底部：虛線分隔 ＋ 走勢折線與面積填充
// 動畫：全息掃光、徽記脈動、刻度環雙向旋轉（charged 加快全部）

const CX = 50;
const CY = 66;

// 一串相切半圓弧（鈔票邊飾的扇貝紋）
function scallop(start: [number, number], count: number, r: number, axis: "h" | "v", sweep: 0 | 1) {
  const step = r * 2;
  const d = axis === "h" ? `${step} 0` : `0 ${step}`;
  return `M${start[0]} ${start[1]} ${Array.from({ length: count }, () => `a ${r} ${r} 0 0 ${sweep} ${d}`).join(" ")}`;
}

// 扭索羅紋：橢圓環多層旋轉疊出防偽紋（外層大環＋中層交織）
const rosette = [
  ...Array.from({ length: 6 }, (_, i) => ({ rx: 30, ry: 16.5, rot: i * 30, c: "A" as const, o: 0.3 })),
  ...Array.from({ length: 4 }, (_, i) => ({ rx: 34, ry: 20, rot: i * 45, c: "P" as const, o: 0.22 })),
  ...Array.from({ length: 6 }, (_, i) => ({ rx: 26, ry: 11, rot: 15 + i * 30, c: "A" as const, o: 0.3 })),
];

// 花瓣曼陀羅：12 片橢圓花瓣（填色＋描邊）繞徽記排列
const petals = Array.from({ length: 12 }, (_, i) => 15 + i * 30);

// 中央放射線：36 道細射線，明暗交替
const rays = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  return {
    x1: CX + 17 * Math.cos(a),
    y1: CY + 17 * Math.sin(a),
    x2: CX + 56 * Math.cos(a),
    y2: CY + 56 * Math.sin(a),
    o: i % 2 ? 0.06 : 0.12,
  };
});

// 中央刻度環：36 格刻度（每三格加長）＋ 四方位小鑽（斜角）
const ringTicks = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2;
  const long = i % 3 === 0;
  const r1 = 30.5;
  const r2 = long ? 34 : 32.6;
  return {
    x1: CX + r1 * Math.cos(a),
    y1: CY + r1 * Math.sin(a),
    x2: CX + r2 * Math.cos(a),
    y2: CY + r2 * Math.sin(a),
    o: long ? 0.55 : 0.4,
  };
});
const compass: [number, number][] = [
  [CX + 21.6, CY - 21.6],
  [CX + 21.6, CY + 21.6],
  [CX - 21.6, CY + 21.6],
  [CX - 21.6, CY - 21.6],
];

// 電路走線：由徽記外圈分岔至內框焊墊
const traces = [
  "M50 45 L50 32 L28 19",
  "M50 45 L50 32 L72 19",
  "M50 87 L50 100 L28 113",
  "M50 87 L50 100 L72 113",
  "M32 66 L17 66",
  "M68 66 L83 66",
];
const pads: [number, number][] = [
  [28, 19],
  [72, 19],
  [28, 113],
  [72, 113],
  [17, 66],
  [83, 66],
];

// 固定星點（避免 SSR/CSR 隨機不一致）
const sparks: [number, number, number][] = [
  [13.5, 21, 0.8],
  [86.5, 23, 0.6],
  [12.5, 110, 0.6],
  [87.5, 108, 0.8],
  [22, 96, 0.5],
  [78, 98, 0.5],
];

// 價位刻度：左右內框縱向排列，長短交替，每五格一個節標點
const tickYs = Array.from({ length: 20 }, (_, i) => 16 + i * 5.4);

// 中央 K 線：三根 ascending 蠟燭（影線＋實體）＋上升箭頭
const candles: [number, number, number, number][] = [
  // [影線上端, 影線下端, 實體 y, 實體高]
  [46, 71.5, 67, 3.6],
  [50, 68, 62, 4.6],
  [54, 64.5, 56.5, 6.4],
];

// 底部走勢折線：緩升的收盤曲線
const trend = "M10 125 L21 120 L29 123 L40 116 L49 119 L60 111 L70 114 L81 105 L88 107";

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
  const uid = useId();
  const key = uid.replace(/[^a-zA-Z0-9-]/g, "");
  const glowId = `cb-glow-${key}`;
  const hatchId = `cb-hatch-${key}`;
  const cut = Math.max(7, size * 0.07);
  const P = theme.primary;
  const A = theme.accent;

  // 四角扇形飾：以角落為圓心的三重四分之一弧
  const corner = (x: number, y: number, sx: 1 | -1, sy: 1 | -1) => (
    <g key={`${x}-${y}`} fill="none" stroke={A} strokeOpacity="0.75" strokeWidth="0.55">
      {[6, 4.4, 2.9].map((r) => (
        <path
          key={r}
          d={`M${x + sx * r} ${y} A ${r} ${r} 0 0 ${sx === 1 === (sy === 1) ? 1 : 0} ${x} ${y + sy * r}`}
        />
      ))}
      <path
        d={`M${x} ${y - 2.1 * sy} L${x + 2.1 * sx} ${y} L${x} ${y + 2.1 * sy} L${x - 2.1 * sx} ${y} Z`}
        fill={A}
        fillOpacity="0.9"
        stroke="none"
      />
    </g>
  );

  // 菱形（fill 用）
  const diamond = (x: number, y: number, s: number) =>
    `M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z`;

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
              color-mix(in srgb, ${theme.primary} 36%, #0b0e14) 0%,
              #0a0c12 46%,
              color-mix(in srgb, ${theme.primary} 20%, #080a10) 100%)`,
          border: `1px solid color-mix(in srgb, ${theme.accent} 46%, transparent)`,
          boxShadow: `
            inset 0 0 ${size * 0.3}px color-mix(in srgb, ${theme.primary} 30%, transparent),
            inset 0 1px 0 color-mix(in srgb, ${theme.accent} 35%, transparent),
            0 ${size * 0.09}px ${size * 0.22}px rgba(0,0,0,0.65)`,
        } as React.CSSProperties
      }
    >
      {/* 主紋樣（SVG） */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" stopColor={A} stopOpacity="0.3" />
            <stop offset="0.55" stopColor={A} stopOpacity="0.09" />
            <stop offset="1" stopColor={A} stopOpacity="0" />
          </radialGradient>
          <pattern id={hatchId} width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="2.6" stroke={P} strokeWidth="0.3" strokeOpacity="0.16" />
            <line x1="0" y1="0" x2="2.6" y2="0" stroke={P} strokeWidth="0.3" strokeOpacity="0.12" />
          </pattern>
        </defs>

        {/* 底紋：交織網紋 ＋ 放射線 ＋ 壓低後的中央光暈 */}
        <rect x="4" y="4" width="92" height="132" rx="6" fill={`url(#${hatchId})`} />
        <g strokeWidth="0.5">
          {rays.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={P} strokeOpacity={r.o} />
          ))}
        </g>
        <circle cx={CX} cy={CY} r="20" fill={`url(#${glowId})`} />

        {/* 價位刻度＋節標點 */}
        <g stroke={P} strokeOpacity="0.6" strokeWidth="0.55">
          {tickYs.map((y, i) => (
            <g key={y}>
              <line x1="10.5" y1={y} x2={i % 2 ? "13" : "14.8"} y2={y} />
              <line x1="89.5" y1={y} x2={i % 2 ? "87" : "85.2"} y2={y} />
              {i % 5 === 0 && <circle cx="12.6" cy={y} r="0.5" fill={A} fillOpacity="0.7" stroke="none" />}
              {i % 5 === 0 && <circle cx="87.4" cy={y} r="0.5" fill={A} fillOpacity="0.7" stroke="none" />}
            </g>
          ))}
        </g>

        {/* 電路走線＋焊墊 */}
        <g fill="none" stroke={P} strokeOpacity="0.5" strokeWidth="0.6">
          {traces.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g>
          {pads.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="2.8" fill="none" stroke={A} strokeOpacity="0.45" strokeWidth="0.45" />
              <circle cx={x} cy={y} r="1.4" fill={A} fillOpacity="0.9" />
            </g>
          ))}
        </g>

        {/* 中央徽記：刻度環 → 方位鑽 → 三層羅紋 → 花瓣 → 雙向旋轉環 → 深盤＋K 線 */}
        <circle cx={CX} cy={CY} r="34" fill="none" stroke={A} strokeOpacity="0.35" strokeWidth="0.5" />
        <g stroke={A} strokeWidth="0.55">
          {ringTicks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeOpacity={t.o} />
          ))}
        </g>
        <g fill={A} fillOpacity="0.8">
          {compass.map(([x, y]) => (
            <path key={`${x}-${y}`} d={diamond(x, y, 1.7)} />
          ))}
        </g>
        <g fill="none" strokeWidth="0.45">
          {rosette.map((r, i) => (
            <ellipse
              key={i}
              cx={CX}
              cy={CY}
              rx={r.rx}
              ry={r.ry}
              transform={`rotate(${r.rot} ${CX} ${CY})`}
              stroke={r.c === "A" ? A : P}
              strokeOpacity={r.o}
            />
          ))}
        </g>
        <circle cx={CX} cy={CY} r="25" fill="none" stroke={P} strokeOpacity="0.3" strokeWidth="0.5" />
        <circle cx={CX} cy={CY} r="21.5" fill="none" stroke={P} strokeOpacity="0.25" strokeWidth="0.5" />
        <g>
          {petals.map((deg) => (
            <ellipse
              key={deg}
              cx={CX}
              cy={CY - 14}
              rx="4.2"
              ry="14"
              transform={`rotate(${deg} ${CX} ${CY})`}
              fill={A}
              fillOpacity="0.12"
              stroke={A}
              strokeOpacity="0.55"
              strokeWidth="0.55"
            />
          ))}
        </g>
        <g
          className="card-back-ring"
          style={{ animationDuration: charged ? "6s" : "16s" }}
        >
          <circle
            cx={CX}
            cy={CY}
            r="20"
            fill="none"
            stroke={A}
            strokeOpacity="0.9"
            strokeWidth="1"
            strokeDasharray="5 3"
          />
        </g>
        <g
          className="card-back-ring-rev"
          style={{ animationDuration: charged ? "9s" : "24s" }}
        >
          <circle
            cx={CX}
            cy={CY}
            r="16.5"
            fill="none"
            stroke={P}
            strokeOpacity="0.7"
            strokeWidth="0.9"
            strokeDasharray="0.2 3"
            strokeLinecap="round"
          />
        </g>
        <circle cx={CX} cy={CY} r="13" fill="none" stroke={P} strokeOpacity="0.55" strokeWidth="0.55" />
        {/* 深色底盤：隔開底紋，讓徽記浮出 */}
        <circle cx={CX} cy={CY} r="12" fill="color-mix(in srgb, #0a0c12 88%, transparent)" />
        <circle cx={CX} cy={CY} r="12" fill="none" stroke={A} strokeOpacity="0.85" strokeWidth="0.7" />
        <g className="card-back-sigil" style={{ animationDuration: charged ? "0.7s" : "2.2s" }}>
          <path
            d={`M${CX} ${CY - 14.5} L${CX + 13} ${CY} L${CX} ${CY + 14.5} L${CX - 13} ${CY} Z`}
            fill={`color-mix(in srgb, ${A} 16%, #0a0c12)`}
            stroke={A}
            strokeOpacity="0.95"
            strokeWidth="1.3"
          />
          <path
            d={`M${CX} ${CY - 10.5} L${CX + 9.5} ${CY} L${CX} ${CY + 10.5} L${CX - 9.5} ${CY} Z`}
            fill="none"
            stroke={P}
            strokeOpacity="0.5"
            strokeWidth="0.5"
          />
          <g fill={A}>
            {candles.map(([top, bottom, by, bh], i) => {
              const x = 45 + i * 3.4;
              return (
                <g key={i}>
                  <line x1={x + 1.2} y1={top} x2={x + 1.2} y2={bottom} stroke={A} strokeWidth="0.6" strokeOpacity="0.95" />
                  <rect x={x} y={by} width="2.4" height={bh} rx="0.4" />
                </g>
              );
            })}
            {/* 上升箭頭 */}
            <path d="M44.5 61.5 L49 57.8 L51 59.3 L55 52.8" fill="none" stroke={A} strokeWidth="0.9" strokeLinecap="round" />
            <path d="M55.8 55 L55 51.8 L52.2 53.6 Z" />
          </g>
        </g>

        {/* 走勢區分隔虛線＋中點鑽 */}
        <line x1="11" y1="100.5" x2="89" y2="100.5" stroke={P} strokeOpacity="0.3" strokeWidth="0.4" strokeDasharray="3 2" />
        <path d={diamond(50, 100.5, 1.7)} fill={A} fillOpacity="0.75" />

        {/* 底部走勢折線＋面積填充 */}
        <path d={`${trend} L88 129 L10 129 Z`} fill={A} fillOpacity="0.08" stroke="none" />
        <path d={trend} fill="none" stroke={A} strokeOpacity="0.85" strokeWidth="0.85" strokeLinejoin="round" />
        <path d="M88 107 L91.5 104.5 L90 108.5 Z" fill={A} fillOpacity="0.85" />
        <g fill={A} fillOpacity="0.85">
          {[
            [21, 120],
            [29, 123],
            [40, 116],
            [49, 119],
            [60, 111],
            [70, 114],
            [81, 105],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.85" />
          ))}
        </g>

        {/* 固定星點 */}
        <g fill={A}>
          {sparks.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fillOpacity="0.55" />
          ))}
        </g>

        {/* 扇貝邊飾帶（鈔票邊飾）：上下左右四條 */}
        <g fill="none" stroke={P} strokeOpacity="0.6" strokeWidth="0.5">
          <path d={scallop([12.6, 6.25], 17, 2.2, "h", 0)} />
          <path d={scallop([12.6, 133.75], 17, 2.2, "h", 1)} />
          <path d={scallop([6.25, 13.2], 26, 2.2, "v", 1)} />
          <path d={scallop([93.75, 13.2], 26, 2.2, "v", 0)} />
        </g>

        {/* 邊飾中點鑽：四邊中點 */}
        <g fill={A} fillOpacity="0.8">
          <path d={diamond(50, 6.25, 1.8)} />
          <path d={diamond(50, 133.75, 1.8)} />
          <path d={diamond(6.25, 70.4, 1.8)} />
          <path d={diamond(93.75, 70.4, 1.8)} />
        </g>

        {/* 三重主框 */}
        <g fill="none">
          <rect x="2" y="2" width="96" height="136" rx="7" stroke={A} strokeOpacity="0.5" strokeWidth="0.5" />
          <rect x="4" y="4" width="92" height="132" rx="6" stroke={A} strokeOpacity="0.9" strokeWidth="1.1" />
          <rect x="8.5" y="8.5" width="83" height="123" rx="3.5" stroke={P} strokeOpacity="0.65" strokeWidth="0.5" />
        </g>

        {/* 四角扇形飾＋角鑽 */}
        {corner(5, 5, 1, 1)}
        {corner(95, 5, -1, 1)}
        {corner(95, 135, -1, -1)}
        {corner(5, 135, 1, -1)}

        {/* 頂部徽記欄：兩側短線＋端鑽＋板塊符號 */}
        <g>
          <line x1="31" y1="13" x2="44.5" y2="13" stroke={A} strokeOpacity="0.7" strokeWidth="0.55" />
          <line x1="55.5" y1="13" x2="69" y2="13" stroke={A} strokeOpacity="0.7" strokeWidth="0.55" />
          <path d={diamond(29.5, 13, 1.3)} fill={A} fillOpacity="0.85" />
          <path d={diamond(70.5, 13, 1.3)} fill={A} fillOpacity="0.85" />
          <text x="50" y="15.2" textAnchor="middle" fontSize="6.6" fontWeight="900" fill={A} fillOpacity="0.95">
            ▤
          </text>
        </g>
      </svg>

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
