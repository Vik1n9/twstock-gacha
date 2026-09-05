import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { boards, poolSnapshots, pools } from "@/lib/db/schema";
import { BOARD_MAP } from "@/lib/sectors/defs";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/pools：開放卡池清單 + 各池最新快照（卡池頁用）
export async function GET() {
  const activePools = await db
    .select()
    .from(pools)
    .where(eq(pools.active, true))
    .orderBy(pools.sortOrder);

  const result = await Promise.all(
    activePools.map(async (pool) => {
      const [snapshot] = await db
        .select()
        .from(poolSnapshots)
        .where(eq(poolSnapshots.poolId, pool.poolId))
        .orderBy(desc(poolSnapshots.snapshotDate))
        .limit(1);

      const [board] = pool.relatedTagId
        ? await db
            .select()
            .from(boards)
            .where(eq(boards.tagId, pool.relatedTagId))
        : [];

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
      };
    }),
  );

  return NextResponse.json({ pools: result });
}
