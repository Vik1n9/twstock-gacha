import "server-only";
import { db } from "@/lib/db/client";
import { boards, poolSnapshots, pools, snapshotStocks } from "@/lib/db/schema";
import { BOARD_MAP } from "@/lib/sectors/defs";
import type { PoolInfo } from "@/lib/api/types";
import { and, desc, eq, sql } from "drizzle-orm";

// 頁面（server component）與 /api/pools 共用的卡池查詢

export async function getActivePools(): Promise<PoolInfo[]> {
  const activePools = await db
    .select()
    .from(pools)
    .where(eq(pools.active, true))
    .orderBy(pools.sortOrder);

  return Promise.all(
    activePools.map(async (pool) => {
      const [snapshot] = await db
        .select()
        .from(poolSnapshots)
        .where(eq(poolSnapshots.poolId, pool.poolId))
        .orderBy(desc(poolSnapshots.snapshotDate))
        .limit(1);

      const [board] = pool.relatedTagId
        ? await db.select().from(boards).where(eq(boards.tagId, pool.relatedTagId))
        : [];

      const rarityRows = await db
        .select({
          direction: snapshotStocks.direction,
          rarity: snapshotStocks.rarity,
          n: sql<number>`count(*)::int`,
        })
        .from(snapshotStocks)
        .where(
          and(
            eq(snapshotStocks.poolId, pool.poolId),
            snapshot
              ? eq(snapshotStocks.snapshotDate, snapshot.snapshotDate)
              : sql`false`,
          ),
        )
        .groupBy(snapshotStocks.direction, snapshotStocks.rarity);

      const rarityCounts: PoolInfo["rarityCounts"] = {};
      for (const r of rarityRows) {
        const bucket = (rarityCounts[r.direction] ??= {
          C: 0,
          R: 0,
          SR: 0,
          SSR: 0,
        });
        if (r.rarity in bucket) bucket[r.rarity as keyof typeof bucket] = r.n;
      }

      return {
        poolId: pool.poolId,
        poolCode: pool.poolCode,
        poolName: pool.poolName,
        poolType: pool.poolType,
        board: board
          ? {
              tagId: board.tagId,
              tagName: board.tagName,
              description: board.description,
              theme: BOARD_MAP[board.tagId]?.theme ?? null,
            }
          : null,
        snapshot: snapshot
          ? {
              snapshotDate: snapshot.snapshotDate,
              stockCount: snapshot.stockCount,
              upStockCount: snapshot.upStockCount,
              downStockCount: snapshot.downStockCount,
              board1dStrength: snapshot.board1dStrength,
              board30dStrength: snapshot.board30dStrength,
              isOpen: snapshot.isOpen,
              reason: snapshot.reason,
            }
          : null,
        rarityCounts,
      };
    }),
  );
}
