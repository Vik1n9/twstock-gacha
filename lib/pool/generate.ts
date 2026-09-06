import { sql } from "drizzle-orm";
import { db } from "../db/client";
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
import { and, eq, lte, desc, inArray } from "drizzle-orm";

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

// 企劃書 5.1 每日快照生成流程（步驟 5–6）
// 冪等：同日期重跑會先刪除舊快照再寫入
export async function generatePoolSnapshots(
  snapshotDate: string,
): Promise<GenerateSummary[]> {
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

    // 該池股票全部歷史（date <= snapshotDate），JS 端分組取視窗
    // beta 資料量：全市場池 ~1100 檔 × ~45 日 ≈ 50k 列，單查詢仍可承受
    const rows = await db
      .select({
        stockCode: stockPrices.stockCode,
        date: stockPrices.date,
        close: stockPrices.close,
      })
      .from(stockPrices)
      .where(
        and(
          inArray(stockPrices.stockCode, codes),
          lte(stockPrices.date, snapshotDate),
        ),
      )
      .orderBy(desc(stockPrices.date), stockPrices.stockCode);

    const byStock = new Map<string, { date: string; close: number }[]>();
    for (const r of rows) {
      const list = byStock.get(r.stockCode);
      if (list) list.push({ date: r.date, close: r.close });
      else byStock.set(r.stockCode, [{ date: r.date, close: r.close }]);
    }

    const metrics: (StockMetrics & { stockCode: string })[] = [];
    for (const [code, closes] of byStock) {
      if (closes[0].date !== snapshotDate) continue; // 企劃書 5.2 條件3：快照日須有收盤
      const m = computeStockMetrics(closes.map((c) => c.close));
      if (m) metrics.push({ stockCode: code, ...m });
    }

    const gate = gatePool(metrics);

    // 冪等寫入：交易內刪舊插新
    await db.transaction(async (tx) => {
      await tx
        .delete(snapshotStocks)
        .where(
          and(
            eq(snapshotStocks.snapshotDate, snapshotDate),
            eq(snapshotStocks.poolId, pool.poolId),
          ),
        );
      await tx
        .delete(poolSnapshots)
        .where(
          and(
            eq(poolSnapshots.snapshotDate, snapshotDate),
            eq(poolSnapshots.poolId, pool.poolId),
          ),
        );

      await tx.insert(poolSnapshots).values({
        snapshotDate,
        poolId: pool.poolId,
        stockCount: gate.stockCount,
        upStockCount: gate.upStockCount,
        downStockCount: gate.downStockCount,
        board1dStrength: gate.board1dStrength,
        board30dStrength: gate.board30dStrength,
        isOpen: gate.isOpen,
        reason: gate.reason,
      });

      if (metrics.length > 0) {
        for (let i = 0; i < metrics.length; i += 500) {
          await tx.insert(snapshotStocks).values(
            metrics.slice(i, i + 500).map((m) => ({
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
          );
        }
      }
    });

    summaries.push({ poolId: pool.poolId, snapshotDate, ...gate });
  }

  return summaries;
}

// 預設快照日：資料庫中最近一個交易日（stock_prices 最大日期）
export async function latestTradingDate(): Promise<string | null> {
  const [row] = await db
    .select({ d: sql<string | null>`max(date)` })
    .from(stockPrices);
  return row?.d ?? null;
}
