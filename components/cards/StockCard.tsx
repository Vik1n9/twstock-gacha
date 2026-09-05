import type { DrawCard } from "@/lib/api/types";

export const RARITY_LABEL: Record<string, string> = {
  C: "C",
  R: "R",
  SR: "SR",
  SSR: "SSR",
};

// 稀有度中文階級（配色：白 → 藍 → 紫 → 橘）
export const RARITY_TIER_NAME: Record<string, string> = {
  C: "常規",
  R: "精良",
  SR: "稀有",
  SSR: "傳說",
};

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// 卡面：企劃書 11.1 卡片顯示（股票、稀有度、方向、收盤、漲跌、板塊）
// 配色規則：稀有度決定主色（C 白 / R 藍 / SR 紫 / SSR 橘），
// 方向決定框體——UP 用稀有度色描邊，DOWN 用黑邊（暗卡）。
export function StockCardFace({
  card,
  boardName,
  compact = false,
}: {
  card: DrawCard;
  boardName?: string | null;
  compact?: boolean;
}) {
  const up = card.direction === "UP";
  return (
    <div
      className={`card-face rar-${card.rarity} dir-${card.direction} relative flex flex-col overflow-hidden ${
        card.rarity === "SSR" || card.rarity === "SR" ? "card-holo" : ""
      } ${compact ? "h-full p-3" : "p-4"}`}
    >
      {/* 稀有度頂條 */}
      <div className="rar-bar pointer-events-none absolute inset-x-0 top-0" />
      {/* 角落切光 */}
      <div className="rar-corner pointer-events-none absolute right-0 top-0" />

      <div className="relative flex items-center justify-between">
        <span className="rar-chip">
          <i className="rar-gem" />
          {RARITY_LABEL[card.rarity]}
        </span>
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: up ? "var(--up)" : "var(--down)" }}
        >
          {up ? "▲" : "▼"} 30日 {fmtPct(card.change30d)}
        </span>
      </div>

      <div className={`relative flex-1 ${compact ? "mt-2" : "mt-4"}`}>
        <div
          className={`font-black tracking-wide ${compact ? "text-lg" : "text-2xl"}`}
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}
        >
          {card.stockName}
        </div>
        <div className="dim font-mono text-sm">{card.stockCode}</div>
        {!compact && (
          <div
            className="mt-1 text-[10px] font-bold tracking-[0.3em]"
            style={{ color: "var(--rar)" }}
          >
            {RARITY_TIER_NAME[card.rarity]}
          </div>
        )}
      </div>

      <div className="relative mt-2 flex items-end justify-between text-xs">
        <div>
          <div className="dim">收盤</div>
          <div className="font-mono text-sm font-bold tabular-nums">{card.close}</div>
        </div>
        <div className="text-right">
          <div className="dim">昨日</div>
          <div
            className="font-mono text-sm font-bold tabular-nums"
            style={{ color: (card.change1d ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {fmtPct(card.change1d)}
          </div>
        </div>
      </div>

      {boardName && (
        <div className="dim relative mt-2 border-t border-[var(--cardline)] pt-2 text-[10px]">
          {boardName}
        </div>
      )}
    </div>
  );
}
