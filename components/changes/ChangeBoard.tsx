"use client";

import { useCallback, useMemo, useState } from "react";
import { StockCardFace } from "@/components/cards/StockCard";
import type { CardDetailData } from "@/components/cards/CardDetail";
import { useIdlePreload } from "@/lib/hooks/useIdlePreload";
import { RARITY_COLOR, type Rarity } from "@/lib/fx/core";
import type { SnapshotChangeCard } from "@/lib/api/types";

// 放大檢視（CardDetail）帶著 GSAP，約 85 KB：清單本身用不到，
// 等瀏覽器閒置才背景載入，玩家點卡片時再以 ensureDetail() 保證就緒。
// 與 /history 同一份 chunk，兩頁互相受惠。
const loadCardDetail = () => import("@/components/cards/CardDetail");

const RARITIES: Rarity[] = ["SSR", "SR", "R", "C"];

type Kind = "upgrade" | "downgrade" | "black" | "white";
const KINDS: { key: Kind; label: string; color: string }[] = [
  { key: "upgrade", label: "升階", color: "var(--gold)" },
  { key: "downgrade", label: "降階", color: "var(--ink-dim)" },
  { key: "black", label: "翻黑", color: "var(--down)" },
  { key: "white", label: "轉白", color: "var(--up)" },
];

// 一張卡可能同時升降階又翻轉方向，所以是「屬於哪些類別」而不是單一分類
function kindsOf(c: SnapshotChangeCard, snapshotDate: string): Kind[] {
  const out: Kind[] = [];
  if (c.rarityMove === "up") out.push("upgrade");
  if (c.rarityMove === "down") out.push("downgrade");
  if (c.directionChangedOn === snapshotDate) {
    out.push(c.direction === "DOWN" ? "black" : "white");
  }
  return out;
}

export function ChangeBoard({
  cards,
  snapshotDate,
}: {
  cards: SnapshotChangeCard[];
  snapshotDate: string;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [filter, setFilter] = useState<Rarity | null>(null);
  const [detail, setDetail] = useState<CardDetailData | null>(null);
  const [detailMod, ensureDetail] = useIdlePreload(loadCardDetail);

  const openDetail = useCallback(
    async (c: CardDetailData) => {
      try {
        await ensureDetail();
      } catch {
        return; // 取不到 chunk 就不開視窗；再點一次會重試
      }
      setDetail(c);
    },
    [ensureDetail],
  );

  const tagged = useMemo(
    () => cards.map((c) => ({ card: c, kinds: kindsOf(c, snapshotDate) })),
    [cards, snapshotDate],
  );

  const counts = useMemo(() => {
    const n: Record<Kind, number> = { upgrade: 0, downgrade: 0, black: 0, white: 0 };
    for (const t of tagged) for (const k of t.kinds) n[k] += 1;
    return n;
  }, [tagged]);

  const filtered = useMemo(
    () =>
      tagged.filter(
        (t) =>
          (kind === null || t.kinds.includes(kind)) &&
          (filter === null || t.card.rarity === filter),
      ),
    [tagged, kind, filter],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="panel p-5">
        <div className="dim text-xs tracking-widest">當日變動</div>
        <div className="mt-1 text-2xl font-black">
          共 {cards.length} 檔異動　·　資料日 {snapshotDate}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <span
              key={k.key}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest"
              style={{
                color: k.color,
                borderColor: `color-mix(in srgb, ${k.color} 45%, transparent)`,
                background: `color-mix(in srgb, ${k.color} 10%, transparent)`,
              }}
            >
              {k.label} ×{counts[k.key]}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-xs">
            {([[null, "全部"], ...KINDS.map((k) => [k.key, k.label] as const)] as const).map(
              ([v, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setKind(v as Kind | null)}
                  className={`px-3 py-1.5 font-bold transition ${
                    kind === v ? "bg-[var(--panel-2)] text-[var(--ink)]" : "dim"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>

          <span className="dim mx-1 text-xs">稀有度</span>
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest transition ${
              filter === null
                ? "border-[var(--ink)] text-[var(--ink)]"
                : "border-[var(--line)] dim"
            }`}
          >
            全部
          </button>
          {RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setFilter(filter === r ? null : r)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest transition"
              style={{
                color: RARITY_COLOR[r],
                borderColor:
                  filter === r
                    ? RARITY_COLOR[r]
                    : `color-mix(in srgb, ${RARITY_COLOR[r]} 32%, transparent)`,
                background:
                  filter === r
                    ? `color-mix(in srgb, ${RARITY_COLOR[r]} 18%, transparent)`
                    : undefined,
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel dim p-8 text-center text-sm">這個條件今天沒有變動的卡片。</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {filtered.map(({ card, kinds }) => (
            <CardButton
              key={card.stockCode}
              card={card}
              kinds={kinds}
              snapshotDate={snapshotDate}
              onOpen={openDetail}
            />
          ))}
        </div>
      )}

      {detailMod && (
        <detailMod.CardDetail card={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function CardButton({
  card,
  kinds,
  snapshotDate,
  onOpen,
}: {
  card: SnapshotChangeCard;
  kinds: Kind[];
  snapshotDate: string;
  onOpen: (c: CardDetailData) => void;
}) {
  // 卡面／詳情吃的是 DrawCard：這裡的卡不是抽出來的，沒有「抽中的稀有度」，
  // 以最終稀有度填 rolledRarity（卡面只用 rarity，詳情也不顯示 rolled）。
  const detailCard: CardDetailData = {
    ...card,
    rolledRarity: card.rarity,
    snapshotDate,
  };
  return (
    <button
      type="button"
      onClick={() => onOpen(detailCard)}
      className="card-btn relative block h-44 text-left"
      aria-label={`查看 ${card.stockName} 詳情`}
    >
      <StockCardFace card={detailCard} boardName={card.boardName} variant="compact" />
      <span className="absolute -right-1.5 -top-1.5 flex gap-1">
        {kinds.map((k) => {
          const meta = KINDS.find((x) => x.key === k)!;
          return (
            <span
              key={k}
              className="rounded-full bg-[var(--panel-2)] px-1.5 py-0.5 text-[10px] font-black ring-1 ring-[var(--line)]"
              style={{ color: meta.color }}
            >
              {meta.label}
            </span>
          );
        })}
      </span>
    </button>
  );
}
