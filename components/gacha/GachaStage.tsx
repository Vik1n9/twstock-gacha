"use client";

import { useCallback, useRef, useState } from "react";
import { SectorBackdrop } from "./SectorBackdrop";
import { PreRoll } from "./PreRoll";
import { FlipCard } from "./FlipCard";
import { WaferGrid } from "./WaferGrid";
import { WaferBurst } from "./WaferBurst";
import { Resonance } from "./Resonance";
import { RevealFx, type RevealFxHandle } from "./RevealFx";
import { StockCardFace, fmtPct } from "@/components/cards/StockCard";
import { CardDetail, type CardDetailData } from "@/components/cards/CardDetail";
import { appendOutcome } from "@/lib/history/store";
import { useLowFx } from "@/lib/hooks/useLowFx";
import type { DrawOutcome, PoolInfo } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { placeholder as fallbackTheme } from "@/lib/sectors/defs";
import { RARITY_COLOR, RARITY_RANK, type Rarity, topRarity } from "@/lib/fx/core";

type Phase = "idle" | "preroll" | "reveal" | "summary";
type DrawType = "single" | "ten";

const PREROLL_MS = 2900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchDraw(
  poolId: string,
  drawType: DrawType,
): Promise<{ ok: true; data: DrawOutcome } | { ok: false; error: string }> {
  const res = await fetch("/api/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poolId, drawType }),
  });
  const j = (await res.json()) as DrawOutcome | { error?: string };
  if (!res.ok) return { ok: false, error: ("error" in j && j.error) || "抽卡失敗" };
  return { ok: true, data: j as DrawOutcome };
}

export function GachaStage({ pools }: { pools: PoolInfo[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [drawType, setDrawType] = useState<DrawType>("single");
  const [outcome, setOutcome] = useState<DrawOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boost, setBoost] = useState(0);
  const [hint, setHint] = useState<Rarity | null>(null);
  const [detail, setDetail] = useState<CardDetailData | null>(null);
  const [low] = useLowFx();

  const stageRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<RevealFxHandle>(null);
  const skipRef = useRef(false);

  const pool = pools.find((p) => p.snapshot?.isOpen) ?? pools[0];
  const theme: SectorTheme = pool?.board?.theme ?? fallbackTheme;
  const boardName = pool?.board?.tagName ?? "";

  // 企劃書 13.1 步驟 4：板塊內股票代號快速流動（演出用範例碼）
  const tickerCodes = ["2330", "2303", "2454", "3034", "2308", "2408", "6770", "3711", "6509", "8081"];

  const impact = useCallback((x: number, y: number, rarity: Rarity) => {
    fxRef.current?.burst(x, y, rarity);
    // 高稀有度翻開時，背景跟著往上推一段
    if (RARITY_RANK[rarity] >= 2) {
      setBoost(RARITY_RANK[rarity] >= 3 ? 1 : 0.7);
      setTimeout(() => setBoost(0.28), 700);
    }
  }, []);

  const start = useCallback(
    async (type: DrawType) => {
      if (!pool?.poolId || busy) return;
      setBusy(true);
      setError(null);
      setOutcome(null);
      setHint(null);
      setDrawType(type);
      setPhase("preroll");
      setBoost(0.18);
      skipRef.current = false;
      fxRef.current?.clear();

      const pending = fetchDraw(pool.poolId, type).then((r) => {
        // 結果先回來 → 給前置演出稀有度預告（彩光預告）
        if (r.ok) setHint(topRarity(r.data.cards));
        return r;
      });

      const [res] = await Promise.all([pending, sleep(low ? 150 : PREROLL_MS)]);
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        setBoost(0);
        setBusy(false);
        return;
      }
      setOutcome(res.data);
      appendOutcome(res.data, type);
      setPhase(skipRef.current ? "summary" : "reveal");
      setBoost(skipRef.current ? 0.12 : 0.34);
      setBusy(false);
    },
    [pool, busy, low],
  );

  const close = () => {
    setPhase("idle");
    setOutcome(null);
    setDetail(null);
    setBoost(0);
    setHint(null);
    fxRef.current?.clear();
  };

  const skip = () => {
    skipRef.current = true;
    fxRef.current?.clear();
    if (outcome) {
      setPhase("summary");
      setBoost(0.12);
    }
  };

  if (phase === "idle") {
    return (
      <div className="panel relative overflow-hidden p-6 text-center">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)` }}
        />
        {/* 企劃書 12.1：抽卡按鈕顯示目前卡池 */}
        <div className="dim text-xs tracking-widest">目前卡池</div>
        <div
          className="mt-1 text-2xl font-black"
          style={{
            color: theme.primary,
            textShadow: `0 0 26px color-mix(in srgb, ${theme.primary} 55%, transparent)`,
          }}
        >
          {pool ? pool.poolName : "讀取中…"}
        </div>
        {pool?.snapshot && (
          <div className="dim mt-1 text-xs">
            資料日 {pool.snapshot.snapshotDate}　|　可抽 {pool.snapshot.stockCount} 檔　|　漲{" "}
            {pool.snapshot.upStockCount} / 跌 {pool.snapshot.downStockCount}
          </div>
        )}

        <RarityLegend />

        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={!pool?.snapshot?.isOpen || busy}
            onClick={() => start("single")}
            className="min-w-36 rounded-xl border-2 px-8 py-3 text-lg font-bold transition hover:brightness-125 disabled:opacity-40"
            style={{
              borderColor: theme.primary,
              color: theme.primary,
              boxShadow: `0 0 24px color-mix(in srgb, ${theme.primary} 28%, transparent)`,
            }}
          >
            單抽
          </button>
          <button
            type="button"
            disabled={!pool?.snapshot?.isOpen || busy}
            onClick={() => start("ten")}
            className="min-w-36 rounded-xl px-8 py-3 text-lg font-bold text-black transition hover:brightness-110 disabled:opacity-40"
            style={{
              background: `linear-gradient(120deg, ${theme.accent}, ${theme.primary})`,
              boxShadow: `0 0 30px color-mix(in srgb, ${theme.accent} 40%, transparent)`,
            }}
          >
            十連抽
          </button>
        </div>
        {pool?.snapshot && !pool.snapshot.isOpen && (
          <div className="mt-3 text-sm" style={{ color: "var(--down)" }}>
            {pool.snapshot.reason ?? "今日未開放"}
          </div>
        )}
        {error && (
          <div className="mt-3 text-sm" style={{ color: "var(--up)" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // 演出層（preroll / reveal / summary）
  const cards = outcome?.cards ?? [];
  const sorted = [...cards].sort(
    (a, b) =>
      RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.change30d - a.change30d,
  );
  const up = cards.filter((c) => c.direction === "UP").length;
  const down = cards.length - up;
  const maxDir = Math.max(up, down);
  const ssrCount = cards.filter((c) => c.rarity === "SSR").length;

  return (
    <div className="fixed inset-0 z-50">
      <SectorBackdrop
        theme={theme}
        low={low}
        boost={boost}
        hue={hint ? RARITY_COLOR[hint] : null}
      />

      <div ref={stageRef} className="absolute inset-0">
        <RevealFx ref={fxRef} theme={theme} low={low} shakeTarget={stageRef} />

        <button
          type="button"
          onClick={close}
          className="absolute right-4 top-4 z-40 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-sm text-white/80 backdrop-blur transition hover:text-white"
        >
          關閉 ✕
        </button>

        {phase !== "summary" && (
          <button
            type="button"
            onClick={skip}
            className="absolute bottom-5 right-5 z-40 rounded-full border border-white/20 bg-black/40 px-4 py-1.5 text-xs tracking-widest text-white/70 backdrop-blur transition hover:text-white"
          >
            跳過演出 ⏭
          </button>
        )}

        {/* 池名徽章（企劃書 15.1） */}
        <div className="absolute left-4 top-4 z-40 flex items-center gap-2 text-xs text-white/80">
          <span
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ border: `1px solid ${theme.accent}`, color: theme.accent }}
          >
            ▤
          </span>
          {outcome?.poolName ?? boardName}
        </div>

        <div className="relative z-10 flex h-full items-center justify-center p-4">
          {phase === "preroll" && (
            <PreRoll
              theme={theme}
              boardName={boardName}
              stockCodes={tickerCodes}
              low={low}
              hint={hint}
              onBoost={setBoost}
              onDone={() => {
                /* 演出長度由 start() 的 Promise.all 控制 */
              }}
            />
          )}

          {phase === "reveal" && drawType === "single" && cards[0] && (
            <FlipCard
              card={cards[0]}
              theme={theme}
              boardName={outcome?.boardName ?? null}
              size={240}
              low={low}
              onImpact={impact}
              onFlipped={() =>
                setTimeout(() => setPhase("summary"), low ? 100 : 1800)
              }
            />
          )}

          {phase === "reveal" && drawType === "ten" && outcome && (
            <WaferGrid
              cards={cards}
              theme={theme}
              boardName={outcome.boardName}
              low={low}
              onImpact={impact}
              onBoost={setBoost}
              onDone={() => setPhase("summary")}
            />
          )}

          {phase === "summary" && outcome && (
            <div className="relative w-full max-w-3xl">
              <Resonance sameCount={maxDir} theme={theme} low={low} />
              {ssrCount > 0 && <WaferBurst theme={theme} low={low} />}
              <div className="relative z-10 max-h-[86vh] overflow-y-auto">
                <div className="mb-4 text-center">
                  <div
                    className="text-xl font-black"
                    style={{
                      color: theme.accent,
                      textShadow: `0 0 22px color-mix(in srgb, ${theme.accent} 55%, transparent)`,
                    }}
                  >
                    {pool?.poolName}　{drawType === "ten" ? "十連" : "單抽"}結果
                  </div>
                  <div className="dim mt-1 text-xs">
                    資料日 {outcome.snapshotDate}　|　板塊 30 日強度{" "}
                    {fmtPct(outcome.board30dStrength)}　|　漲 {up} / 跌 {down}
                    {ssrCount > 0 && `　|　SSR ×${ssrCount}`}
                  </div>
                  <div className="dim mt-1 text-[11px]">點卡片看完整資料</div>
                </div>
                <div
                  className={`grid gap-3 ${
                    drawType === "ten"
                      ? "grid-cols-3 sm:grid-cols-5"
                      : "mx-auto max-w-xs grid-cols-1"
                  }`}
                >
                  {sorted.map((c, i) => (
                    <button
                      key={`${c.stockCode}-${i}`}
                      type="button"
                      aria-label={`查看 ${c.stockName} 詳情`}
                      onClick={() =>
                        setDetail({
                          ...c,
                          boardName: outcome.boardName,
                          poolName: outcome.poolName,
                          snapshotDate: outcome.snapshotDate,
                        })
                      }
                      className={`card-btn block text-left ${
                        drawType === "single" ? "min-h-64" : "min-h-44"
                      }`}
                    >
                      <StockCardFace
                        card={c}
                        boardName={outcome.boardName}
                        variant={drawType === "ten" ? "compact" : "full"}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => start(drawType)}
                    className="rounded-xl border-2 px-6 py-2.5 font-bold transition hover:brightness-125"
                    style={{ borderColor: theme.primary, color: theme.primary }}
                  >
                    再抽一次
                  </button>
                  <button
                    type="button"
                    onClick={() => start(drawType === "ten" ? "single" : "ten")}
                    className="rounded-xl border border-white/25 px-6 py-2.5 font-bold text-white/85 transition hover:text-white"
                  >
                    換{drawType === "ten" ? "單抽" : "十連"}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl border border-white/25 px-6 py-2.5 font-bold text-white/60 transition hover:text-white"
                  >
                    關閉
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <CardDetail card={detail} onClose={() => setDetail(null)} />
      </div>
    </div>
  );
}

// 稀有度色階圖例：C 白 / R 藍 / SR 紫 / SSR 橘
function RarityLegend() {
  const items: { r: Rarity; label: string }[] = [
    { r: "C", label: "常規" },
    { r: "R", label: "精良" },
    { r: "SR", label: "稀有" },
    { r: "SSR", label: "傳說" },
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {items.map(({ r, label }) => (
        <span
          key={r}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest"
          style={{
            color: RARITY_COLOR[r],
            borderColor: `color-mix(in srgb, ${RARITY_COLOR[r]} 50%, transparent)`,
            background: `color-mix(in srgb, ${RARITY_COLOR[r]} 12%, transparent)`,
          }}
        >
          <i
            className="h-[7px] w-[7px] rotate-45"
            style={{
              background: RARITY_COLOR[r],
              boxShadow: `0 0 8px ${RARITY_COLOR[r]}`,
            }}
          />
          {r}
          <span className="opacity-60">{label}</span>
        </span>
      ))}
    </div>
  );
}
