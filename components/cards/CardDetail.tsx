"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { RARITY_TIER_NAME, StockCardFace, fmtPct } from "./StockCard";
import { CardBack } from "@/components/gacha/CardBack";
import type { DrawCard } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { placeholder } from "@/lib/sectors/defs";
import { RARITY_COLOR, RARITY_FX } from "@/lib/fx/core";
import { useLowFx } from "@/lib/hooks/useLowFx";

// 放大檢視的卡片資料：抽卡結果與抽卡紀錄共用
export interface CardDetailData extends DrawCard {
  poolName?: string | null;
  snapshotDate?: string | null;
  drawnAt?: number | null;
}

const CARD_W = 230;
const CARD_H = 322;

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CardDetail({
  card,
  onClose,
}: {
  card: CardDetailData | null;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  const shellRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const [low] = useLowFx();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Esc 關閉；開啟期間鎖住底層捲動
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [card]);

  const key = card ? `${card.stockCode}-${card.drawnAt ?? ""}` : null;

  // 開啟演出：卡背翻面 → 由遠推近放大 → 光暈脈衝 → 資料列依序帶出
  useEffect(() => {
    if (!key) return;
    const inner = innerRef.current;
    const shell = shellRef.current;
    if (!inner || !shell) return;

    if (low) {
      gsap.set(inner, { rotationY: 0, scale: 1, z: 0, autoAlpha: 1 });
      gsap.set([shell, backdropRef.current, infoRef.current], { autoAlpha: 1 });
      return;
    }

    const rows = infoRef.current?.querySelectorAll("[data-row]") ?? [];
    // 這是查閱用的介面，演出走「快、輕」：全長約 0.42s，翻面只是交代這是同一張卡
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    tl.fromTo(
      backdropRef.current,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.12 },
      0,
    )
      .fromTo(
        shell,
        { autoAlpha: 0, scale: 0.97, y: 8 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.2 },
        0,
      )
      // 卡片：卡背朝上、略縮在後方，翻面同時推近
      .fromTo(
        inner,
        { rotationY: -180, scale: 0.72, z: -240, rotationX: 6, autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.06, ease: "none" },
        0.02,
      )
      .to(inner, { rotationY: 0, duration: 0.3, ease: "power2.inOut" }, 0.04)
      .to(
        inner,
        { scale: 1, z: 0, rotationX: 0, duration: 0.36, ease: "power3.out" },
        0.04,
      )
      // 翻到正面時輕點一下稀有度光，不做大爆點
      .fromTo(
        glowRef.current,
        { autoAlpha: 0, scale: 0.85 },
        { autoAlpha: 0.5, scale: 1.1, duration: 0.14 },
        0.26,
      )
      .to(glowRef.current, { autoAlpha: 0.22, scale: 1, duration: 0.24 }, 0.4)
      .fromTo(
        rows,
        { autoAlpha: 0, x: 8 },
        { autoAlpha: 1, x: 0, duration: 0.18, stagger: 0.018 },
        0.12,
      );

    return () => {
      tl.kill();
    };
  }, [key, low]);

  // 卡背沿用稀有度配色，讓翻面前就先透出這張卡的等級
  const backTheme: SectorTheme = useMemo(() => {
    if (!card) return placeholder;
    const fx = RARITY_FX[card.rarity];
    return { ...placeholder, primary: fx.color, accent: fx.spark, bg: "#0b0d12" };
  }, [card]);

  if (!card) return null;

  const up = card.direction === "UP";
  const rar = RARITY_COLOR[card.rarity];

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "公司名稱", value: card.stockName },
    { label: "股票代號", value: <span className="font-mono">{card.stockCode}</span> },
    { label: "所屬板塊", value: card.boardName ?? "—" },
    {
      label: "30 日漲跌",
      value: (
        <span className="font-mono font-bold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
          {up ? "▲" : "▼"} {fmtPct(card.change30d)}
        </span>
      ),
    },
    { label: "昨日收盤", value: <span className="font-mono font-bold">{card.close}</span> },
    {
      label: "昨日漲跌",
      value: (
        <span
          className="font-mono font-bold"
          style={{ color: (card.change1d ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}
        >
          {fmtPct(card.change1d)}
        </span>
      ),
    },
    {
      label: "稀有度",
      value: (
        <span className="font-bold" style={{ color: rar }}>
          {card.rarity}　{RARITY_TIER_NAME[card.rarity]}
          {card.rolledRarity !== card.rarity && (
            <span className="dim ml-2 text-xs">（原始 {card.rolledRarity} 降級）</span>
          )}
        </span>
      ),
    },
    { label: "資料日", value: card.snapshotDate ?? "—" },
  ];

  if (card.poolName) rows.push({ label: "卡池", value: card.poolName });
  if (card.drawnAt) rows.push({ label: "抽出時間", value: fmtTime(card.drawnAt) });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.stockName} 卡片詳情`}
    >
      <button
        ref={backdropRef}
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/80 opacity-0 backdrop-blur-sm"
      />

      <div
        ref={shellRef}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 opacity-0 sm:flex-row sm:items-start"
      >
        {/* 放大卡面：卡背翻面 + zoom in */}
        <div
          className="relative mx-auto shrink-0"
          style={{ width: CARD_W, height: CARD_H, perspective: 1200 }}
        >
          <div
            ref={glowRef}
            className="pointer-events-none absolute -inset-8 opacity-0"
            style={{
              background: `radial-gradient(closest-side, ${rar}, transparent 70%)`,
              filter: "blur(22px)",
            }}
          />
          <div
            ref={innerRef}
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* 正面：卡面 */}
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
              <StockCardFace card={card} boardName={card.boardName} variant="full" />
            </div>
            {/* 背面：卡背 */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <CardBack theme={backTheme} size={CARD_W} />
            </div>
          </div>
        </div>

        {/* 完整資料 */}
        <div ref={infoRef} className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3" data-row>
            <div className="min-w-0">
              <div className="text-xl font-black">{card.stockName}</div>
              <div className="dim font-mono text-sm">{card.stockCode}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1 text-sm dim hover:text-[var(--ink)]"
            >
              關閉 ✕
            </button>
          </div>

          <dl className="mt-4 divide-y divide-[var(--line)] text-sm">
            {rows.map((r) => (
              <div
                key={r.label}
                data-row
                className="flex items-center justify-between gap-4 py-2"
              >
                <dt className="dim shrink-0 text-xs tracking-wider">{r.label}</dt>
                <dd className="min-w-0 truncate text-right">{r.value}</dd>
              </div>
            ))}
          </dl>

          <div className="dim mt-3 text-[11px] leading-relaxed" data-row>
            稀有度由個股近 30 個交易日漲跌幅決定；方向為該股在資料日的漲跌方向
            （漲＝白卡、跌＝黑卡）。收盤價為資料日之原始收盤價，未還原除權息。
          </div>
        </div>
      </div>
    </div>
  );
}
