import { db } from "../db/client";
import {
  boards,
  drawRecords as drawRecordsTable,
  poolSnapshots,
  pools,
  snapshotStocks,
  stocks,
} from "../db/schema";
import { buildPoolState, drawOnce, type DrawResult } from "./engine";
import { and, desc, eq } from "drizzle-orm";

export type DrawType = "single" | "ten";

export interface DrawCard {
  stockCode: string;
  stockName: string;
  direction: DrawResult["direction"];
  rolledRarity: DrawResult["rolledRarity"];
  rarity: DrawResult["finalRarity"];
  close: number;
  change1d: number | null;
  change30d: number;
}

export interface DrawOutcome {
  poolId: string;
  poolName: string;
  boardName: string | null;
  snapshotDate: string;
  stockCount: number;
  upStockCount: number;
  downStockCount: number;
  board30dStrength: number | null;
  cards: DrawCard[];
}

export type DrawError =
  | { code: "POOL_NOT_FOUND" }
  | { code: "POOL_NOT_OPEN"; reason: string | null }
  | { code: "NO_SNAPSHOT" }
  | { code: "ANOMALY" };

// 企劃書 8/9/10：從玩家所選卡池抽卡（單抽 1 張、十連 10 張獨立抽選）
export async function draw(
  poolId: string,
  drawType: DrawType,
): Promise<{ ok: true; outcome: DrawOutcome } | { ok: false; error: DrawError }> {
  const [pool] = await db.select().from(pools).where(eq(pools.poolId, poolId));
  if (!pool) return { ok: false, error: { code: "POOL_NOT_FOUND" } };

  const [snapshot] = await db
    .select()
    .from(poolSnapshots)
    .where(
      and(
        eq(poolSnapshots.poolId, poolId),
        eq(poolSnapshots.isOpen, true),
      ),
    )
    .orderBy(desc(poolSnapshots.snapshotDate))
    .limit(1);
  if (!snapshot) return { ok: false, error: { code: "NO_SNAPSHOT" } };

  const rows = await db
    .select({
      stockCode: snapshotStocks.stockCode,
      direction: snapshotStocks.direction,
      rarity: snapshotStocks.rarity,
      weight: snapshotStocks.weight,
      stockName: stocks.name,
      close: snapshotStocks.close,
      change1d: snapshotStocks.change1d,
      change30d: snapshotStocks.change30d,
    })
    .from(snapshotStocks)
    .innerJoin(stocks, eq(stocks.stockCode, snapshotStocks.stockCode))
    .where(
      and(
        eq(snapshotStocks.snapshotDate, snapshot.snapshotDate),
        eq(snapshotStocks.poolId, poolId),
        eq(snapshotStocks.drawable, true),
      ),
    );

  const state = buildPoolState(rows);

  const n = drawType === "ten" ? 10 : 1;
  const results: DrawResult[] = [];
  // 企劃書 10.3：方向空池視為異常 → 重新抽取，最多 3 次
  for (let i = 0; i < n; i++) {
    let drawn: DrawResult | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      drawn = drawOnce(state);
      if (drawn) break;
    }
    if (!drawn) return { ok: false, error: { code: "ANOMALY" } };
    results.push(drawn);
  }

  await db.insert(drawRecordsTable).values(
    results.map((r) => ({
      poolId,
      snapshotDate: snapshot.snapshotDate,
      drawType,
      stockCode: r.stockCode,
      direction: r.direction,
      rolledRarity: r.rolledRarity,
      finalRarity: r.finalRarity,
    })),
  );

  const byCode = new Map(rows.map((r) => [r.stockCode, r]));
  const [board] = pool.relatedTagId
    ? await db.select().from(boards).where(eq(boards.tagId, pool.relatedTagId))
    : [];

  const cards: DrawCard[] = results.map((r) => {
    const row = byCode.get(r.stockCode)!;
    return {
      stockCode: r.stockCode,
      stockName: row.stockName,
      direction: r.direction,
      rolledRarity: r.rolledRarity,
      rarity: r.finalRarity,
      close: row.close,
      change1d: row.change1d,
      change30d: row.change30d,
    };
  });

  return {
    ok: true,
    outcome: {
      poolId,
      poolName: pool.poolName,
      boardName: board?.tagName ?? null,
      snapshotDate: snapshot.snapshotDate,
      stockCount: snapshot.stockCount,
      upStockCount: snapshot.upStockCount,
      downStockCount: snapshot.downStockCount,
      board30dStrength: snapshot.board30dStrength,
      cards,
    },
  };
}
