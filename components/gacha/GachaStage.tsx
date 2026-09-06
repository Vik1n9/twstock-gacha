"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
// 演出元件一律以動態 import 取得（見下方 loadFx）；此處只留型別，型別會被編譯抹除
import type { RevealFxHandle } from "./RevealFx";
import { StockCardFace, fmtPct } from "@/components/cards/StockCard";
import type { CardDetailData } from "@/components/cards/CardDetail";
import { appendOutcome } from "@/lib/history/store";
import { useLowFx } from "@/lib/hooks/useLowFx";
import { useIdlePreload } from "@/lib/hooks/useIdlePreload";
import type { DrawCard, DrawOutcome, PoolInfo } from "@/lib/api/types";
import type { SectorTheme } from "@/lib/sectors/defs";
import { MARKET_POOL, placeholder as fallbackTheme } from "@/lib/sectors/defs";
import { RARITY_COLOR, RARITY_RANK, type Rarity, topRarity } from "@/lib/fx/core";

type Phase = "idle" | "preroll" | "reveal" | "summary";
type DrawType = "single" | "ten";

const PREROLL_MS = 2900;
const POOL_PREF_KEY = "twstock-pool";

// 卡池偏好（localStorage）：useSyncExternalStore 模式，SSR 回 null、客戶端讀偏好
const poolPrefListeners = new Set<() => void>();
function getPoolPref(): string | null {
  try {
    return localStorage.getItem(POOL_PREF_KEY);
  } catch {
    return null;
  }
}
function setPoolPref(id: string): void {
  try {
    localStorage.setItem(POOL_PREF_KEY, id);
  } catch {
    /* 配額或隱私模式：不影響本次選擇 */
  }
  poolPrefListeners.forEach((l) => l());
}
function subscribePoolPref(listener: () => void): () => void {
  poolPrefListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === POOL_PREF_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    poolPrefListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 演出層（GSAP ＋ canvas 特效，約 85 KB）不進首屏 bundle：改為抽卡才需要的
// 獨立 chunk。瀏覽器閒置時先背景預載，start() 再保證載完才切換 phase，
// 因此按下抽卡通常是零等待，且不會出現元件還沒到就先切畫面的閃爍。
const loadFx = () => import("./performance");

// 「客戶端已掛載」訊號：hydration 期間回 false，之後回 true。
// 用於區分 server render／hydration commit 與真正讀到客戶端狀態的時機。
const mountedSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(mountedSubscribe, () => true, () => false);
}

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
  // 跳變演出：結果含 jumpFrom 標記的最高稀有卡時，前置演出先以低階色蓄力再跳升
  const [jumpFrom, setJumpFrom] = useState<"R" | "SR" | null>(null);
  const [detail, setDetail] = useState<CardDetailData | null>(null);
  // 演出元件模組（閒置預載 + 需要時 ensureFx 保證就緒）；idle 畫面完全不需要它
  const [fx, ensureFx] = useIdlePreload(loadFx);
  const [low] = useLowFx();
  // 企劃書 12.1：玩家可選擇卡池（記住上次選擇；未選時預設全市場池）
  const selectedPoolId = useSyncExternalStore(subscribePoolPref, getPoolPref, () => null);
  const selectPool = useCallback((id: string) => setPoolPref(id), []);

  const selected = selectedPoolId
    ? pools.find((p) => p.poolId === selectedPoolId)
    : null;
  // 預設卡池＝全市場池（永久開放，企劃書 2.1）；玩家選過才跟隨選擇
  const fallbackPool =
    pools.find((p) => p.poolId === MARKET_POOL.poolId) ??
    pools.find((p) => p.snapshot?.isOpen) ??
    pools[0];
  const pool = (selected?.snapshot?.isOpen ? selected : null) ?? fallbackPool;
  const theme: SectorTheme = pool?.board?.theme ?? fallbackTheme;
  const boardName = pool?.board?.tagName ?? "";

  const stageRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<RevealFxHandle>(null);
  const skipRef = useRef(false);

  // 企劃書 13.1 步驟 4：板塊內股票代號快速流動（演出用範例碼）
  const tickerCodes = ["2330", "2303", "2454", "3034", "2308", "2408", "6770", "3711", "6509", "8081"];

  const impact = useCallback(
    (x: number, y: number, rarity: Rarity, jumpFrom?: "R" | "SR" | null) => {
      // 跳變兩段式爆點：先低階色小爆，短暫停頓後結果色正式爆開
      if (jumpFrom) {
        fxRef.current?.burst(x, y, jumpFrom);
        setTimeout(() => fxRef.current?.burst(x, y, rarity), low ? 90 : 170);
      } else {
        fxRef.current?.burst(x, y, rarity);
      }
      // 高稀有度翻開時，背景跟著往上推一段
      if (RARITY_RANK[rarity] >= 2) {
        setBoost(RARITY_RANK[rarity] >= 3 ? 1 : 0.7);
        setTimeout(() => setBoost(0.28), 700);
      }
    },
    [low],
  );

  // PreRoll 跳變瞬間：畫面中央先炸一發結果色（RevealFx 層在前置演出之上）
  const fireJump = useCallback((rarity: Rarity) => {
    fxRef.current?.burst(window.innerWidth / 2, window.innerHeight / 2, rarity);
  }, []);

  const start = useCallback(
    async (type: DrawType) => {
      if (!pool?.poolId || busy) return;
      setBusy(true);
      setError(null);
      setOutcome(null);
      setHint(null);
      setJumpFrom(null);
      setDrawType(type);

      // 演出元件就緒才切 phase（閒置預載通常已完成，此處多半是零等待）；
      // 期間 busy 為 true，抽卡鍵維持 disabled。
      try {
        await ensureFx();
      } catch {
        // 斷網或 chunk 取不到：放開 busy 讓玩家能重試，不要卡死抽卡鍵
        setError("演出資源載入失敗，請確認網路後再試一次。");
        setBusy(false);
        return;
      }

      setPhase("preroll");
      setBoost(0.18);
      skipRef.current = false;
      fxRef.current?.clear();

      const pending = fetchDraw(pool.poolId, type).then((r) => {
        // 結果先回來 → 給前置演出稀有度預告（彩光預告）＋跳變前兆標記
        if (r.ok) {
          const top = topRarity(r.data.cards);
          setHint(top);
          setJumpFrom(
            r.data.cards.find((c) => c.rarity === top && c.jumpFrom)?.jumpFrom ??
              null,
          );
        }
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
    [pool, busy, low, ensureFx],
  );

  const close = () => {
    setPhase("idle");
    setOutcome(null);
    setDetail(null);
    setBoost(0);
    setHint(null);
    setJumpFrom(null);
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
      <>
        {/* 主頁背景隨卡池主題變色：底色平滑過渡＋頂部光暈淡入，讓玩家知道選到哪一池 */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-700"
          style={{
            backgroundColor: `color-mix(in srgb, ${theme.primary} 15%, transparent)`,
          }}
        />
        <div
          key={pool?.poolId ?? "none"}
          aria-hidden
          className="bg-glow-in pointer-events-none fixed inset-0 -z-10"
          style={{
            background: `radial-gradient(ellipse 90% 46% at 50% -8%, color-mix(in srgb, ${theme.primary} 38%, transparent), transparent 72%)`,
          }}
        />
        <div className="panel pool-scope relative overflow-hidden p-4 text-center sm:p-6">
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
          {pool?.board?.description && (
            <div className="dim mt-1 text-xs">{pool.board.description}</div>
          )}
          {pool?.snapshot && (
            <div className="dim mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
              <span>資料日 {pool.snapshot.snapshotDate}</span>
              <span aria-hidden>|</span>
              <span>可抽 {pool.snapshot.stockCount} 檔</span>
              <span aria-hidden>|</span>
              <span>
                漲 {pool.snapshot.upStockCount} / 跌 {pool.snapshot.downStockCount}
              </span>
              <span aria-hidden>|</span>
              <span>30 日強度 {fmtPct(pool.snapshot.board30dStrength)}</span>
            </div>
          )}

          <RarityLegend />

          {/* 寬度＝下方卡池小卡（--pool-w）：手機填滿面板寬度，桌機 19rem */}
          <div className="mx-auto mt-5 flex w-[var(--pool-w)] items-center gap-4">
            <button
              type="button"
              disabled={!pool?.snapshot?.isOpen || busy}
              onClick={() => start("single")}
              onPointerEnter={() => void ensureFx().catch(() => {})}
              className="flex-1 rounded-xl border-2 px-4 py-3 text-lg font-bold transition hover:brightness-125 disabled:opacity-40"
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
              onPointerEnter={() => void ensureFx().catch(() => {})}
              className="flex-1 rounded-xl px-4 py-3 text-lg font-bold text-black transition hover:brightness-110 disabled:opacity-40"
              style={{
                background: `linear-gradient(120deg, ${theme.accent}, ${theme.primary})`,
                boxShadow: `0 0 30px color-mix(in srgb, ${theme.accent} 40%, transparent)`,
              }}
            >
              十連抽
            </button>
          </div>

          {/* 企劃書 12.1 卡池選擇：抽卡鍵下方，左右循環滑動 */}
          <PoolCarousel
            pools={pools}
            currentPoolId={pool?.poolId ?? null}
            onSelect={selectPool}
          />

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
      </>
    );
  }

  // 演出層（preroll / reveal / summary）
  // start() 已 await ensureFx()，正常不會落到這個 guard；純為型別收斂與保險
  if (!fx) return null;
  const { SectorBackdrop, PreRoll, FlipCard, WaferGrid, WaferBurst, Resonance, RevealFx, CardDetail } = fx;

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
              jumpFrom={jumpFrom}
              onBoost={setBoost}
              onJump={fireJump}
              onDone={() => {
                /* 演出長度由 start() 的 Promise.all 控制 */
              }}
            />
          )}

          {phase === "reveal" && drawType === "single" && cards[0] && (
            <FlipCard
              card={cards[0]}
              theme={theme}
              boardName={cards[0].boardName ?? outcome?.boardName ?? null}
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
              {/* 企劃書 15.3 板塊共振：全市場池卡為混合板塊，依同板塊計數；
                  板塊池內同板塊恆成立，維持同方向計數 */}
              <Resonance
                sameCount={
                  pool?.poolType === "market"
                    ? maxGroupCount(cards, (c) => c.boardName ?? boardName)
                    : maxDir
                }
                theme={theme}
                low={low}
              />
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
                        boardName={c.boardName ?? outcome.boardName}
                        variant={drawType === "ten" ? "compact" : "full"}
                      />
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
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

// 同 key 計數取最大（全市場池板塊共振用，企劃書 15.3）
function maxGroupCount(
  cards: DrawCard[],
  keyOf: (c: DrawCard) => string,
): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const c of cards) {
    const k = keyOf(c);
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    if (n > max) max = n;
  }
  return max;
}

// 企劃書 12.1 卡池選擇：抽卡鍵下方、左右循環滑動（清單渲染三副本達成無縫循環）
// 手機優先：小卡寬度＝面板可用寬度（--pool-w），一次剛好一張；觸控裝置交給原生捲動吸附，
// 手指離開後自動選中停在中央的池，點小卡也能直接選（三副本皆可點，避免點到副本沒反應）。
// 左右箭頭移到標題列——絕對定位的箭頭會蓋住滿版小卡的左右緣，是手機點不到卡池的主因之一。
// 規範 §7：low/reduced-motion 走瞬時捲動。
function PoolCarousel({
  pools,
  currentPoolId,
  onSelect,
}: {
  pools: PoolInfo[];
  currentPoolId: string | null;
  onSelect: (id: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; scroll: number } | null>(null);
  const draggedAtRef = useRef(0); // 最近一次滑鼠拖曳結束的時間戳（用來擋拖曳尾端的誤點）
  const animatingRef = useRef(0); // 程式化平滑捲動的落定計時器
  const idleRef = useRef(0); // 使用者捲動停止的 debounce 計時器
  const [low] = useLowFx();

  const cancelIdle = useCallback(() => {
    window.clearTimeout(idleRef.current);
    idleRef.current = 0;
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(animatingRef.current);
      window.clearTimeout(idleRef.current);
    },
    [],
  );

  const behavior = useCallback((): ScrollBehavior => {
    if (low) return "auto";
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return "auto";
    }
    return "smooth";
  }, [low]);

  // 取三副本中最接近目前視窗中心的那顆小卡（避免程式化捲動跨副本來回）
  const nearestChip = useCallback((poolId?: string) => {
    const el = stripRef.current;
    if (!el) return null;
    const chips = Array.from(
      el.querySelectorAll<HTMLElement>(
        poolId ? `[data-pool="${poolId}"]` : "[data-pool]",
      ),
    );
    if (chips.length === 0) return null;
    const center = el.scrollLeft + el.clientWidth / 2;
    const dist = (c: HTMLElement) =>
      Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
    return chips.reduce((best, c) => (dist(c) < dist(best) ? c : best));
  }, []);

  // 等程式化平滑捲動落定：需先偵測到實際位移（UA 捲動有起步延遲，避免誤判），
  // 再連續停滯兩次讀值即視為結束。目標本來就在中央時捲動不會啟動，
  // 5 個 tick（約 0.3 秒）內沒動就直接收工——否則會一路空轉到上限，
  // 這段期間 onScroll 被視為程式化捲動而略過，使用者接著滑動就選不到池。
  const waitSettle = useCallback(
    (onSettled: () => void) => {
      const el = stripRef.current;
      if (!el) return;
      window.clearTimeout(animatingRef.current);
      const startX = el.scrollLeft;
      let last = el.scrollLeft;
      let stable = 0;
      let ticks = 0;
      let moved = false;
      const tick = () => {
        ticks++;
        const cur = el.scrollLeft;
        if (cur !== startX) moved = true;
        if (moved && cur === last) stable++;
        else if (cur !== last) stable = 0;
        last = cur;
        if ((moved && stable >= 2) || (!moved && ticks >= 5) || ticks > 20) {
          animatingRef.current = 0;
          onSettled();
          return;
        }
        animatingRef.current = window.setTimeout(tick, 60);
      };
      animatingRef.current = window.setTimeout(tick, 60);
    },
    [],
  );

  // 循環修正：把 scrollLeft 正規化到「視窗中央那張卡一定落在中間副本」的區間，
  // 超出就位移整整一個副本寬（內容週期性重複，視覺完全等價）。
  // 舊版用 [0.3, 1.7] 副本寬當界線，中央有一半機率落在副本 0／2 的卡上——
  // 那些卡是 disabled 的，正是「點了卡池沒反應」的來源；改用精確區間杜絕。
  // 只在捲動停下時呼叫：慣性滑動途中改 scrollLeft 會中斷手機的滑動慣性。
  const correctLoop = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return; // 卡池太少、無可捲動範圍
    const chips = Array.from(el.querySelectorAll<HTMLElement>("[data-pool]"));
    const per = chips.length / 3;
    if (!Number.isInteger(per) || per === 0) return;
    const stride = chips[per].offsetLeft - chips[0].offsetLeft; // 單一副本寬（含間距）
    const step = chips[1] ? chips[1].offsetLeft - chips[0].offsetLeft : stride; // 單張卡步距
    if (stride <= 0 || step <= 0) return;
    // 第 i 張卡置中時 scrollLeft = i * step，故中央落在副本 1 ⇔ scrollLeft ∈ [lo, lo + stride)
    const lo = stride - step / 2;
    const norm = lo + ((((el.scrollLeft - lo) % stride) + stride) % stride);
    if (Math.abs(norm - el.scrollLeft) > 0.5) el.scrollLeft = norm;
  }, []);

  const centerChip = useCallback(
    (chip: HTMLElement) => {
      cancelIdle();
      const b = behavior();
      if (b === "smooth") {
        // 平滑置中：抑制循環修正直到落定（絕對目標位置不變，中途修正會震盪）
        chip.scrollIntoView({ behavior: b, inline: "center", block: "nearest" });
        waitSettle(correctLoop);
      } else {
        chip.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
        correctLoop();
      }
    },
    [behavior, cancelIdle, correctLoop, waitSettle],
  );

  // 使用者捲動（觸控慣性／滾輪／拖曳）停下後：先做循環修正，
  // 再把停在中央的卡池設為選中——手機的主要操作就是滑動，滑完不該還要再點一下。
  const onScroll = useCallback(() => {
    if (animatingRef.current) return; // 程式化捲動中：由 waitSettle 收尾
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => {
      idleRef.current = 0;
      if (animatingRef.current) return;
      correctLoop();
      const id = nearestChip()?.dataset.pool;
      if (id && id !== currentPoolId) onSelect(id);
    }, 150);
  }, [correctLoop, currentPoolId, nearestChip, onSelect]);

  // 初始定位：等客戶端就緒（hydration 完成＋useSyncExternalStore 已讀到偏好）後，
  // 瞬時置中目前池一次。不能在 hydration commit 就定位——當下偏好尚未讀到，
  // currentPoolId 是父層解析的後備池（全市場），會把一次性 flag 燒在錯的池上，
  // 之後讀到真正偏好就再也不會置中。之後的選池改變都走 centerChip 平滑動畫。
  const didCenterRef = useRef(false);
  const ready = useMounted();
  useEffect(() => {
    if (!ready || didCenterRef.current || !currentPoolId) return;
    didCenterRef.current = true;
    const el = stripRef.current;
    if (!el) return;
    const chips = el.querySelectorAll<HTMLElement>(
      `[data-pool="${currentPoolId}"]`,
    );
    const chip = chips[1] ?? chips[0];
    if (!chip) return;
    el.scrollLeft =
      chip.offsetLeft + chip.offsetWidth / 2 - el.clientWidth / 2;
  }, [ready, currentPoolId]);

  // 箭頭：把目前中央 chip 的左／右鄰居平滑置中，落定後選中（循環）
  // 用「相鄰 chip」定位而非固定步距——各池名稱長度不同，固定步距會瞄不準
  const nudge = useCallback(
    (dir: 1 | -1) => {
      const el = stripRef.current;
      if (!el) return;
      cancelIdle();
      const chips = Array.from(el.querySelectorAll<HTMLElement>("[data-pool]"));
      if (chips.length === 0) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      const dist = (c: HTMLElement) =>
        Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
      const current = chips.reduce((best, c) =>
        dist(c) < dist(best) ? c : best,
      );
      const idx = chips.indexOf(current);
      const target = chips[(idx + dir + chips.length) % chips.length];
      if (!target) return;
      const b = behavior();
      if (b === "smooth") {
        target.scrollIntoView({ behavior: b, inline: "center", block: "nearest" });
        waitSettle(() => {
          correctLoop();
          const chip = nearestChip();
          if (chip?.dataset.pool) onSelect(chip.dataset.pool);
        });
      } else {
        target.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
        correctLoop();
        if (target.dataset.pool) onSelect(target.dataset.pool);
      }
    },
    [behavior, cancelIdle, correctLoop, nearestChip, onSelect, waitSettle],
  );

  // 滑鼠拖曳（觸控裝置走原生滾動慣性＋CSS 吸附，不攔）
  // 注意：不可用 setPointerCapture——capture 會把 pointerup 導回 strip，
  // 瀏覽器合成的 click 目標隨之變成 strip，小卡的 onClick 會失效
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = stripRef.current;
      if (!el) return;
      window.clearTimeout(animatingRef.current);
      animatingRef.current = 0;
      cancelIdle();
      dragRef.current = { x: e.clientX, scroll: el.scrollLeft };
      let dragged = false;
      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag || !el) return;
        const dx = ev.clientX - drag.x;
        if (Math.abs(dx) > 4) dragged = true;
        el.scrollLeft = drag.scroll - dx;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        dragRef.current = null;
        if (!dragged) return;
        // 時間戳而非布林旗標：拖曳若沒有落在小卡上就不會有 click 來清旗標，
        // 舊版會讓旗標一直留著，把下一次真正的點擊吃掉（點不到卡池）
        draggedAtRef.current = Date.now();
        // 吸附：最接近中央的池設為選中並平滑置中
        const chip = nearestChip();
        if (chip?.dataset.pool) onSelect(chip.dataset.pool);
        if (chip) centerChip(chip);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [cancelIdle, centerChip, nearestChip, onSelect],
  );

  // 拖曳結束當下合成的 click 不觸發選池（避免誤選滑過的小卡）
  const onChipClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() - draggedAtRef.current > 250) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 每池一張小卡，寬度＝ --pool-w：手機剛好填滿面板可用寬度（一次一張），
  // sm 以上為 19rem（＝單抽＋十連抽鍵相加），與上方按鈕列左右緣對齊
  const renderCard = (p: PoolInfo, copy: number) => {
    const color = p.board?.theme?.primary ?? null;
    const active = p.poolId === currentPoolId;
    const clone = copy !== 1; // 副本 0／2 只為循環服務：不進無障礙樹、不可 Tab，但仍可點
    const snap = p.snapshot;
    return (
      <button
        key={`${copy}-${p.poolId}`}
        type="button"
        data-pool={p.poolId}
        tabIndex={clone ? -1 : undefined}
        aria-hidden={clone || undefined}
        aria-pressed={active || undefined}
        title={p.poolName}
        onClick={() => {
          onSelect(p.poolId);
          const chip = nearestChip(p.poolId);
          if (chip) centerChip(chip);
        }}
        className={`pool-card w-[var(--pool-w)] shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition hover:brightness-125 ${
          active ? "" : "opacity-80"
        }`}
        style={{
          borderColor:
            active && color
              ? color
              : (color
                  ? `color-mix(in srgb, ${color} 35%, transparent)`
                  : "var(--line)"),
          background:
            active && color
              ? `color-mix(in srgb, ${color} 14%, transparent)`
              : undefined,
          boxShadow:
            active && color
              ? `0 0 18px color-mix(in srgb, ${color} 30%, transparent)`
              : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <i
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]"
            style={{
              background: color ?? "var(--ink-dim)",
              boxShadow: color ? `0 0 8px ${color}` : undefined,
            }}
          />
          <span
            className="truncate text-sm font-black"
            style={{ color: color ?? undefined }}
          >
            {p.board?.tagName ?? p.poolName}
          </span>
          <span className="dim ml-auto shrink-0 text-[11px] tabular-nums">
            可抽 {snap ? snap.stockCount : "–"} 檔
          </span>
        </div>
        <div className="dim mt-1 flex items-center gap-2 pl-[18px] text-[11px] tabular-nums">
          <span>
            漲 {snap?.upStockCount ?? "–"} / 跌 {snap?.downStockCount ?? "–"}
          </span>
          {snap?.board30dStrength != null && (
            <span className="ml-auto">30 日 {fmtPct(snap.board30dStrength)}</span>
          )}
        </div>
      </button>
    );
  };

  const arrowClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--panel-2)] text-lg leading-none text-white/70 transition hover:text-white active:brightness-125";

  return (
    <div className="mt-5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="dim text-xs tracking-widest">選擇卡池</span>
        <span className="dim text-[11px]">滑動或點選</span>
        <button
          type="button"
          aria-label="上一個卡池"
          onClick={() => nudge(-1)}
          className={`${arrowClass} ml-auto`}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="下一個卡池"
          onClick={() => nudge(1)}
          className={arrowClass}
        >
          ›
        </button>
      </div>
      <div
        ref={stripRef}
        aria-label="選擇卡池"
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onClickCapture={onChipClickCapture}
        className="pool-strip relative flex select-none items-center gap-2 overflow-x-auto py-1"
        style={{
          // 置中墊：50% 減小卡半寬，讓任一張小卡都能捲到正中央
          // （手機 --pool-w 為 100% → 墊寬 0，小卡本身即滿版）
          paddingLeft: "max(calc(50% - var(--pool-w) / 2), 0px)",
          paddingRight: "max(calc(50% - var(--pool-w) / 2), 0px)",
        }}
      >
        {[0, 1, 2].map((copy) => pools.map((p) => renderCard(p, copy)))}
      </div>
    </div>
  );
}

// 稀有度色階圖例：C 白 / R 藍 / SR 紫 / SSR 橘
function RarityLegend() {  const items: { r: Rarity; label: string }[] = [
    { r: "C", label: "常規" },
    { r: "R", label: "精良" },
    { r: "SR", label: "稀有" },
    { r: "SSR", label: "傳說" },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 justify-items-center gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
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
