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

// 卡面尺寸級距：卡框變小時同步縮字級、拿掉次要欄位，避免文字溢出
// full＝單抽大卡／頁面卡；compact＝十連結果格；mini＝演出中的小卡背翻面（~90px）
export type CardVariant = "full" | "compact" | "mini";

const V = {
  full: {
    pad: "p-4",
    chip: "text-[10px] px-2 py-0.5",
    gem: "h-[7px] w-[7px]",
    pct: "text-xs",
    nameGap: "mt-4",
    name: "text-2xl",
    code: "text-sm",
    stat: "text-xs",
    statVal: "text-sm",
    corner: "h-11 w-11",
  },
  compact: {
    pad: "p-2.5",
    chip: "text-[9px] px-1.5 py-0.5",
    gem: "h-[6px] w-[6px]",
    pct: "text-[10px]",
    nameGap: "mt-1.5",
    name: "text-base",
    code: "text-[11px]",
    stat: "text-[9px]",
    statVal: "text-[11px]",
    corner: "h-8 w-8",
  },
  mini: {
    pad: "p-2",
    chip: "text-[8px] px-1 py-0",
    gem: "h-[5px] w-[5px]",
    pct: "text-[9px]",
    nameGap: "mt-1",
    name: "text-[12px]",
    code: "text-[9px]",
    stat: "text-[8px]",
    statVal: "text-[10px]",
    corner: "h-6 w-6",
  },
} as const;

// 卡面：企劃書 11.1 卡片顯示（股票、稀有度、方向、收盤、漲跌、板塊）
// 配色規則：稀有度決定主色（C 白 / R 藍 / SR 紫 / SSR 橘），
// 方向決定框體——UP 用稀有度色描邊，DOWN 用黑邊（暗卡）。
export function StockCardFace({
  card,
  boardName,
  compact = false,
  variant,
}: {
  card: DrawCard;
  boardName?: string | null;
  /** 舊介面：等同 variant="compact" */
  compact?: boolean;
  variant?: CardVariant;
}) {
  const v: CardVariant = variant ?? (compact ? "compact" : "full");
  const s = V[v];
  const up = card.direction === "UP";
  const full = v === "full";
  const mini = v === "mini";

  return (
    <div
      className={`card-face rar-${card.rarity} dir-${card.direction} relative flex h-full flex-col overflow-hidden ${
        card.rarity === "SSR" || card.rarity === "SR" ? "card-holo" : ""
      } ${s.pad}`}
    >
      {/* 稀有度頂條 */}
      <div className="rar-bar pointer-events-none absolute inset-x-0 top-0" />
      {/* 角落切光 */}
      <div className={`rar-corner pointer-events-none absolute right-0 top-0 ${s.corner}`} />

      {/* 卡頭：徽章與 30 日漲跌各自不換行，空間不足時徽章優先保留 */}
      <div className="relative flex items-center justify-between gap-1">
        <span className={`rar-chip shrink-0 ${s.chip}`}>
          <i className={`rar-gem ${s.gem}`} />
          {RARITY_LABEL[card.rarity]}
        </span>
        {!mini && (
          <span
            className={`min-w-0 truncate font-bold tabular-nums ${s.pct}`}
            style={{ color: up ? "var(--up-c)" : "var(--down-c)" }}
          >
            {up ? "▲" : "▼"} {full ? "30日 " : ""}
            {fmtPct(card.change30d)}
          </span>
        )}
      </div>

      <div className={`relative min-h-0 flex-1 ${s.nameGap}`}>
        <div
          className={`truncate font-black tracking-wide ${s.name}`}
          title={card.stockName}
        >
          {card.stockName}
        </div>
        <div className={`dim truncate font-mono ${s.code}`}>{card.stockCode}</div>
        {full && (
          <div
            className="mt-1 text-[10px] font-bold tracking-[0.3em]"
            style={{ color: "var(--rar-use)" }}
          >
            {RARITY_TIER_NAME[card.rarity]}
          </div>
        )}
      </div>

      {/* mini 卡框只有 ~90px 寬，徽章與漲跌幅擠同一列會被截掉，改成獨佔一列 */}
      {mini ? (
        <div
          className={`relative mt-1 truncate font-bold tabular-nums ${s.pct}`}
          style={{ color: up ? "var(--up-c)" : "var(--down-c)" }}
        >
          {up ? "▲" : "▼"} {fmtPct(card.change30d)}
        </div>
      ) : (
        <div className={`relative mt-1.5 flex items-end justify-between gap-1 ${s.stat}`}>
          <div className="min-w-0">
            <div className="dim">收盤</div>
            <div className={`truncate font-mono font-bold tabular-nums ${s.statVal}`}>
              {card.close}
            </div>
          </div>
          <div className="min-w-0 text-right">
            <div className="dim">昨日</div>
            <div
              className={`truncate font-mono font-bold tabular-nums ${s.statVal}`}
              style={{ color: (card.change1d ?? 0) >= 0 ? "var(--up-c)" : "var(--down-c)" }}
            >
              {fmtPct(card.change1d)}
            </div>
          </div>
        </div>
      )}

      {boardName && !mini && (
        <div
          className={`dim relative mt-1.5 truncate border-t border-[var(--card-line)] pt-1.5 ${
            full ? "text-[10px]" : "text-[9px]"
          }`}
        >
          {boardName}
        </div>
      )}
    </div>
  );
}
