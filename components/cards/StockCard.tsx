import type { DrawCard } from "@/lib/api/types";

export const RARITY_LABEL: Record<string, string> = {
  C: "C",
  R: "R",
  SR: "SR",
  SSR: "SSR",
};

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// 卡面：企劃書 11.1 卡片顯示（股票、稀有度、方向、收盤、漲跌、板塊）
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
      className={`card-face rar-${card.rarity} relative flex flex-col overflow-hidden ${
        card.rarity === "SSR" ? "card-ssr" : ""
      } ${compact ? "h-full p-3" : "p-4"}`}
      style={{ boxShadow: `0 0 18px color-mix(in srgb, var(--rar) 25%, transparent)` }}
    >
      <div className="flex items-center justify-between">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-black tracking-widest"
          style={{ color: "var(--rar)", border: "1px solid var(--cardline)" }}
        >
          {RARITY_LABEL[card.rarity]}
        </span>
        <span
          className="text-xs font-bold"
          style={{ color: up ? "var(--up)" : "var(--down)" }}
        >
          {up ? "▲" : "▼"} 30日 {fmtPct(card.change30d)}
        </span>
      </div>

      <div className={`flex-1 ${compact ? "mt-2" : "mt-4"}`}>
        <div className={`font-black tracking-wide ${compact ? "text-lg" : "text-2xl"}`}>
          {card.stockName}
        </div>
        <div className="dim text-sm">{card.stockCode}</div>
      </div>

      <div className="mt-2 flex items-end justify-between text-xs">
        <div>
          <div className="dim">收盤</div>
          <div className="font-mono text-sm font-bold">{card.close}</div>
        </div>
        <div className="text-right">
          <div className="dim">昨日</div>
          <div
            className="font-mono text-sm font-bold"
            style={{ color: (card.change1d ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}
          >
            {fmtPct(card.change1d)}
          </div>
        </div>
      </div>

      {boardName && (
        <div className="dim mt-2 border-t border-[var(--line)] pt-2 text-[10px]">
          {boardName}
        </div>
      )}
    </div>
  );
}
