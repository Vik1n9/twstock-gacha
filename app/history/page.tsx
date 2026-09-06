"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { StockCardFace } from "@/components/cards/StockCard";
import type { CardDetailData } from "@/components/cards/CardDetail";
import { clearHistory, useHistory, type HistoryEntry } from "@/lib/history/store";
import { RARITY_COLOR, RARITY_RANK, type Rarity } from "@/lib/fx/core";
import { useIdlePreload } from "@/lib/hooks/useIdlePreload";

// 放大檢視（CardDetail）帶著 GSAP，約 85 KB：紀錄列表本身用不到，
// 等瀏覽器閒置才背景載入，玩家點卡片時再以 ensureDetail() 保證就緒。
const loadCardDetail = () => import("@/components/cards/CardDetail");

type View = "collection" | "timeline";
const RARITIES: Rarity[] = ["SSR", "SR", "R", "C"];

// 收藏檢視：同一檔股票收斂成一張，保留最高稀有度與抽中次數
interface CollectionItem {
  entry: HistoryEntry;
  count: number;
}

function toCollection(list: HistoryEntry[]): CollectionItem[] {
  const map = new Map<string, CollectionItem>();
  for (const e of list) {
    const prev = map.get(e.stockCode);
    if (!prev) {
      map.set(e.stockCode, { entry: e, count: 1 });
      continue;
    }
    prev.count += 1;
    // 保留最高稀有度那張；同稀有度時保留較新的（list 已是新到舊）
    if (RARITY_RANK[e.rarity] > RARITY_RANK[prev.entry.rarity]) prev.entry = e;
  }
  return [...map.values()].sort(
    (a, b) =>
      RARITY_RANK[b.entry.rarity] - RARITY_RANK[a.entry.rarity] ||
      b.entry.change30d - a.entry.change30d,
  );
}

export default function HistoryPage() {
  const history = useHistory();
  const [view, setView] = useState<View>("collection");
  const [filter, setFilter] = useState<Rarity | null>(null);
  const [detail, setDetail] = useState<CardDetailData | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
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

  const filtered = useMemo(
    () => (filter ? history.filter((e) => e.rarity === filter) : history),
    [history, filter],
  );
  const collection = useMemo(() => toCollection(filtered), [filtered]);

  const stats = useMemo(() => {
    const counts: Record<Rarity, number> = { C: 0, R: 0, SR: 0, SSR: 0 };
    for (const e of history) counts[e.rarity] += 1;
    return {
      total: history.length,
      unique: new Set(history.map((e) => e.stockCode)).size,
      counts,
    };
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <div className="text-lg font-black">還沒有抽卡紀錄</div>
        <div className="dim mt-2 text-sm">
          抽過的卡片會存在這台裝置的瀏覽器裡，隨時可以回來翻看。
        </div>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl border-2 border-[var(--gold)] px-6 py-2.5 font-bold text-[var(--gold)] transition hover:brightness-125"
        >
          去抽卡
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="panel p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="dim text-xs tracking-widest">抽卡紀錄</div>
            <div className="mt-1 text-2xl font-black">
              共 {stats.total} 抽　·　{stats.unique} 檔不重複
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {RARITIES.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest"
                  style={{
                    color: RARITY_COLOR[r],
                    borderColor: `color-mix(in srgb, ${RARITY_COLOR[r]} 45%, transparent)`,
                    background: `color-mix(in srgb, ${RARITY_COLOR[r]} 10%, transparent)`,
                  }}
                >
                  {r} ×{stats.counts[r]}
                </span>
              ))}
            </div>
          </div>

          {confirmClear ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="dim">確定清除全部紀錄？</span>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setConfirmClear(false);
                }}
                className="rounded-lg border border-[var(--up)] px-3 py-1.5 font-bold text-[var(--up)]"
              >
                清除
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 dim hover:text-[var(--ink)]"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm dim hover:text-[var(--ink)]"
            >
              清除紀錄
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[var(--line)] text-xs">
            {(
              [
                ["collection", "收藏"],
                ["timeline", "全部紀錄"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-bold transition ${
                  view === v ? "bg-[var(--panel-2)] text-[var(--ink)]" : "dim"
                }`}
              >
                {label}
              </button>
            ))}
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
        <div className="panel dim p-8 text-center text-sm">這個稀有度還沒有抽到過。</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {view === "collection"
            ? collection.map(({ entry, count }) => (
                <CardButton
                  key={entry.stockCode}
                  entry={entry}
                  badge={count > 1 ? `×${count}` : null}
                  onOpen={openDetail}
                />
              ))
            : filtered.map((entry) => (
                <CardButton key={entry.id} entry={entry} badge={null} onOpen={openDetail} />
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
  entry,
  badge,
  onOpen,
}: {
  entry: HistoryEntry;
  badge: string | null;
  onOpen: (c: CardDetailData) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="card-btn relative block h-44 text-left"
      aria-label={`查看 ${entry.stockName} 詳情`}
    >
      <StockCardFace card={entry} boardName={entry.boardName} variant="compact" />
      {badge && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--panel-2)] px-1.5 py-0.5 text-[10px] font-black text-[var(--ink)] ring-1 ring-[var(--line)]">
          {badge}
        </span>
      )}
    </button>
  );
}
