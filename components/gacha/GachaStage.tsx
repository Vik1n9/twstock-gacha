"use client";

import { useCallback, useState } from "react";
import { SectorBackdrop } from "./SectorBackdrop";
import { PreRoll } from "./PreRoll";
import { FlipCard } from "./FlipCard";
import { WaferGrid } from "./WaferGrid";
import { WaferBurst } from "./WaferBurst";
import { Resonance } from "./Resonance";
import { StockCardFace, fmtPct } from "@/components/cards/StockCard";
import { useLowFx } from "@/lib/hooks/useLowFx";
import type { DrawOutcome, PoolInfo } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { placeholder as fallbackTheme } from "@/lib/sectors/defs";

type Phase = "idle" | "preroll" | "reveal" | "summary";
type DrawType = "single" | "ten";

const RARITY_ORDER = { SSR: 0, SR: 1, R: 2, C: 3 } as const;

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
  const [low] = useLowFx();

  const pool = pools.find((p) => p.snapshot?.isOpen) ?? pools[0];
  const theme: SectorTheme = pool?.board?.theme ?? fallbackTheme;
  const boardName = pool?.board?.tagName ?? "";

  // 企劃書 13.1 步驟 4：板塊內股票代號快速流動（演出用範例碼）
  const tickerCodes = ["2330", "2303", "2454", "3034", "2308", "2408", "6770", "3711", "6509", "8081"];

  const start = useCallback(
    async (type: DrawType) => {
      if (!pool?.poolId || busy) return;
      setBusy(true);
      setError(null);
      setOutcome(null);
      setDrawType(type);
      setPhase("preroll");
      const [res] = await Promise.all([
        fetchDraw(pool.poolId, type),
        sleep(low ? 150 : 2500), // 前置演出時長（低特效略過）
      ]);
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        setBusy(false);
        return;
      }
      setOutcome(res.data);
      setPhase("reveal");
      setBusy(false);
    },
    [pool, busy, low],
  );

  const close = () => {
    setPhase("idle");
    setOutcome(null);
  };

  if (phase === "idle") {
    return (
      <div className="panel p-6 text-center">
        {/* 企劃書 12.1：抽卡按鈕顯示目前卡池 */}
        <div className="dim text-xs tracking-widest">目前卡池</div>
        <div className="mt-1 text-2xl font-black" style={{ color: theme.primary }}>
          {pool ? pool.poolName : "讀取中…"}
        </div>
        {pool?.snapshot && (
          <div className="dim mt-1 text-xs">
            資料日 {pool.snapshot.snapshotDate}　|　可抽 {pool.snapshot.stockCount} 檔　|　漲{" "}
            {pool.snapshot.upStockCount} / 跌 {pool.snapshot.downStockCount}
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={!pool?.snapshot?.isOpen || busy}
            onClick={() => start("single")}
            className="min-w-36 rounded-xl border-2 px-8 py-3 text-lg font-bold transition hover:brightness-125 disabled:opacity-40"
            style={{ borderColor: theme.primary, color: theme.primary }}
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
      RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || b.change30d - a.change30d,
  );
  const up = cards.filter((c) => c.direction === "UP").length;
  const down = cards.length - up;
  const maxDir = Math.max(up, down);
  const ssrCount = cards.filter((c) => c.rarity === "SSR").length;

  return (
    <div className="fixed inset-0 z-50">
      <SectorBackdrop theme={theme} low={low} />

      <button
        type="button"
        onClick={close}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-sm text-white/80 hover:text-white"
      >
        關閉 ✕
      </button>

      {/* 池名徽章（企劃書 15.1） */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 text-xs text-white/80">
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
            size={210}
            low={low}
            onFlipped={() => setTimeout(() => setPhase("summary"), low ? 100 : 1300)}
          />
        )}

        {phase === "reveal" && drawType === "ten" && outcome && (
          <WaferGrid
            cards={cards}
            theme={theme}
            boardName={outcome.boardName}
            low={low}
            onDone={() => setPhase("summary")}
          />
        )}

        {phase === "summary" && outcome && (
          <div className="relative w-full max-w-3xl">
            <Resonance sameCount={maxDir} theme={theme} low={low} />
            {ssrCount > 0 && <WaferBurst theme={theme} low={low} />}
            <div className="relative max-h-[86vh] overflow-y-auto">
              <div className="mb-4 text-center">
                <div className="text-xl font-black" style={{ color: theme.accent }}>
                  {pool?.poolName}　{drawType === "ten" ? "十連" : "單抽"}結果
                </div>
                <div className="dim mt-1 text-xs">
                  資料日 {outcome.snapshotDate}　|　板塊 30 日強度{" "}
                  {fmtPct(outcome.board30dStrength)}　|　漲 {up} / 跌 {down}
                  {ssrCount > 0 && `　|　SSR ×${ssrCount}`}
                </div>
              </div>
              <div
                className={`grid gap-3 ${
                  drawType === "ten"
                    ? "grid-cols-3 sm:grid-cols-5"
                    : "mx-auto max-w-xs grid-cols-1"
                }`}
              >
                {sorted.map((c, i) => (
                  <div
                    key={`${c.stockCode}-${i}`}
                    className={drawType === "single" ? "min-h-64" : "min-h-44"}
                  >
                    <StockCardFace
                      card={c}
                      boardName={outcome.boardName}
                      compact={drawType === "ten"}
                    />
                  </div>
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
    </div>
  );
}
