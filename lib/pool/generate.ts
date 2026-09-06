import { sql } from "drizzle-orm";
import { getDb, batchAll, type BatchStatements } from "../db/client";
import {
  poolSnapshots,
  pools,
  snapshotStocks,
  stockBoards,
  stocks,
  stockPrices,
  type Pool,
} from "../db/schema";
import {
  computeStockMetrics,
  gatePool,
  type StockMetrics,
} from "./snapshot";
import { and, eq, gte, lte, desc, inArray } from "drizzle-orm";

export interface GenerateSummary {
  poolId: string;
  snapshotDate: string;
  stockCount: number;
  upStockCount: number;
  downStockCount: number;
  board1dStrength: number | null;
  board30dStrength: number | null;
  isOpen: boolean;
  reason: string | null;
}

// 池成員查詢：板塊池＝stock_boards 映射（企劃書 16.2，跨池為常態）；
// 全市場池＝所有活躍上市普通股（企劃書 2.1）
async function getPoolStockCodes(pool: Pool): Promise<string[]> {
  const db = await getDb();
  if (pool.poolType === "market") {
    const rows = await db
      .select({ c: stocks.stockCode })
      .from(stocks)
      .where(eq(stocks.active, true));
    return rows.map((r) => r.c);
  }
  if (!pool.relatedTagId) return [];
  const rows = await db
    .select({ c: stocks.stockCode })
    .from(stocks)
    .innerJoin(
      stockBoards,
      and(
        eq(stockBoards.stockCode, stocks.stockCode),
        eq(stockBoards.tagId, pool.relatedTagId),
      ),
    )
    .where(eq(stocks.active, true));
  return [...new Set(rows.map((r) => r.c))];
}

// 快照只需要每檔最近 31 個交易日的收盤（computeStockMetrics 用到 closes[0] 與 closes[30]）。
// 60 個日曆日約含 40 個交易日，即使碰上農曆年連假也仍有 35 個以上，餘裕足夠。
// 不設下界的話，stock_prices 會隨營運天數無限成長，而整段歷史都要載進 Worker
// 記憶體（單一 isolate 上限 128 MB），全市場池一年後就有撞牆風險。
const PRICE_WINDOW_DAYS = 60;

function windowStartDate(snapshotDate: string, days: number): string {
  const d = new Date(`${snapshotDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// 企劃書 5.1 每日快照生成流程（步驟 5–6）
// 冪等：同日期重跑會覆蓋既有快照（見下方寫入順序說明）
export async function generatePoolSnapshots(
  snapshotDate: string,
): Promise<GenerateSummary[]> {
  const db = await getDb();
  const windowStart = windowStartDate(snapshotDate, PRICE_WINDOW_DAYS);
  const activePools = await db
    .select()
    .from(pools)
    .where(
      and(eq(pools.active, true), inArray(pools.poolType, ["board", "market"])),
    );

  const summaries: GenerateSummary[] = [];

  for (const pool of activePools) {
    const codes = await getPoolStockCodes(pool);
    if (codes.length === 0) {
      summaries.push({
        poolId: pool.poolId,
        snapshotDate,
        stockCount: 0,
        upStockCount: 0,
        downStockCount: 0,
        board1dStrength: null,
        board30dStrength: null,
        isOpen: false,
        reason: "池內無股票",
      });
      continue;
    }

    // 該池股票在 [windowStart, snapshotDate] 內的收盤，JS 端分組取視窗
    // D1 單查詢上限 100 綁定參數：全市場池（＝所有活躍股票）直接查全表；
    // 板塊池以 90 檔為單位分批 IN，各檔只會落在單一分批，分組順序不受影響
    const selectPoolPrices = (part: string[]) =>
      db
        .select({
          stockCode: stockPrices.stockCode,
          date: stockPrices.date,
          close: stockPrices.close,
        })
        .from(stockPrices)
        .where(
          and(
            part.length > 0 ? inArray(stockPrices.stockCode, part) : undefined,
            gte(stockPrices.date, windowStart),
            lte(stockPrices.date, snapshotDate),
          ),
        )
        .orderBy(desc(stockPrices.date), stockPrices.stockCode);

    const byStock = new Map<string, { date: string; close: number }[]>();
    if (pool.poolType === "market") {
      // 全市場池＝所有活躍股票，價格查詢不加 IN 過濾（會超過 100 個綁定參數上限），
      // 改在下方以 poolCodes 對齊池成員
      const rows = await selectPoolPrices([]);
      for (const r of rows) {
        const list = byStock.get(r.stockCode);
        if (list) list.push({ date: r.date, close: r.close });
        else byStock.set(r.stockCode, [{ date: r.date, close: r.close }]);
      }
    } else {
      // 板塊池：以 90 檔為單位分批 IN，各檔只會落在單一分批
      for (let i = 0; i < codes.length; i += 90) {
        const rows = await selectPoolPrices(codes.slice(i, i + 90));
        for (const r of rows) {
          const list = byStock.get(r.stockCode);
          if (list) list.push({ date: r.date, close: r.close });
          else byStock.set(r.stockCode, [{ date: r.date, close: r.close }]);
        }
      }
    }

    // 全市場池的價格查詢沒有 IN 過濾，byStock 會含到已停用個股（停用當天仍有
    // 當日收盤列）。原本只靠「快照日須有收盤」剔除，要等隔天 ingest 略過它才生效，
    // 等於停用後仍會在池內留一天。改為明確對齊池成員。
    const poolCodes = new Set(codes);
    const metrics: (StockMetrics & { stockCode: string })[] = [];
    for (const [code, closes] of byStock) {
      if (!poolCodes.has(code)) continue;
      if (closes[0].date !== snapshotDate) continue; // 企劃書 5.2 條件3：快照日須有收盤
      const m = computeStockMetrics(closes.map((c) => c.close));
      if (m) metrics.push({ stockCode: code, ...m });
    }

    const gate = gatePool(metrics);

    // 冪等寫入。D1 沒有互動式交易，batch 也只在「單次呼叫內」原子，而全市場池
    // 的 statement 數遠超過單批容量，一定會被切成多次 batch。
    // 舊寫法是「先 delete 再 insert」，中途失敗會讓該池明細全空、抽卡直接壞掉，
    // 且要等隔天 cron 才會修復。改成「upsert 明細 → 刪殘留 → 最後寫摘要」：
    //   - 任何中途失敗，明細都不會變空（最壞是新舊混合，每列仍是合法卡片）
    //   - 摘要最後寫，失敗時前台照樣讀到前一個交易日的完整快照
    //   - 全程冪等，手動或隔日重跑會收斂
    // 注意：這仍不是原子的，只是把「壞掉」降級成「暫時不是最新」。
    const existing = await db
      .select({ stockCode: snapshotStocks.stockCode })
      .from(snapshotStocks)
      .where(
        and(
          eq(snapshotStocks.snapshotDate, snapshotDate),
          eq(snapshotStocks.poolId, pool.poolId),
        ),
      );

    // D1 單查詢上限 100 個綁定參數：snapshot_stocks 每列 11 欄 → 每批最多 9 列
    const upserts: BatchStatements = [];
    for (let i = 0; i < metrics.length; i += 9) {
      upserts.push(
        db
          .insert(snapshotStocks)
          .values(
            metrics.slice(i, i + 9).map((m) => ({
              snapshotDate,
              poolId: pool.poolId,
              stockCode: m.stockCode,
              direction: m.direction,
              rarity: m.rarity,
              change30d: m.change30d,
              change1d: m.change1d,
              close: m.close,
              weight: 1,
              drawable: true,
            })),
          )
          .onConflictDoUpdate({
            target: [
              snapshotStocks.snapshotDate,
              snapshotStocks.poolId,
              snapshotStocks.stockCode,
            ],
            set: {
              direction: sql`excluded.direction`,
              rarity: sql`excluded.rarity`,
              change30d: sql`excluded.change_30d`,
              change1d: sql`excluded.change_1d`,
              close: sql`excluded.close`,
              weight: sql`excluded.weight`,
              drawable: sql`excluded.drawable`,
            },
          }),
      );
    }
    for (let i = 0; i < upserts.length; i += 50) {
      await batchAll(upserts.slice(i, i + 50));
    }

    // 本次不再入池的殘留列（個股被移出板塊，或價格視窗已不足 31 日）
    const current = new Set(metrics.map((m) => m.stockCode));
    const stale = existing
      .map((r) => r.stockCode)
      .filter((code) => !current.has(code));
    // 每批 90 個 stock_code ＋ 快照日與池 ID 共 2 個綁定值，仍在 100 上限內
    for (let i = 0; i < stale.length; i += 90) {
      await db
        .delete(snapshotStocks)
        .where(
          and(
            eq(snapshotStocks.snapshotDate, snapshotDate),
            eq(snapshotStocks.poolId, pool.poolId),
            inArray(snapshotStocks.stockCode, stale.slice(i, i + 90)),
          ),
        );
    }

    // 摘要最後寫：它一寫入就代表「這池今天的明細已就位」
    await db
      .insert(poolSnapshots)
      .values({
        snapshotDate,
        poolId: pool.poolId,
        stockCount: gate.stockCount,
        upStockCount: gate.upStockCount,
        downStockCount: gate.downStockCount,
        board1dStrength: gate.board1dStrength,
        board30dStrength: gate.board30dStrength,
        isOpen: gate.isOpen,
        reason: gate.reason,
      })
      .onConflictDoUpdate({
        target: [poolSnapshots.snapshotDate, poolSnapshots.poolId],
        set: {
          stockCount: sql`excluded.stock_count`,
          upStockCount: sql`excluded.up_stock_count`,
          downStockCount: sql`excluded.down_stock_count`,
          board1dStrength: sql`excluded.board_1d_strength`,
          board30dStrength: sql`excluded.board_30d_strength`,
          isOpen: sql`excluded.is_open`,
          reason: sql`excluded.reason`,
        },
      });

    summaries.push({ poolId: pool.poolId, snapshotDate, ...gate });
  }

  return summaries;
}

// 預設快照日：資料庫中最近一個交易日（stock_prices 最大日期）
export async function latestTradingDate(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ d: sql<string | null>`max(date)` })
    .from(stockPrices);
  return row?.d ?? null;
}
