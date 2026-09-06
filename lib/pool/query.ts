import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import { boards, poolSnapshots, pools, snapshotStocks } from "@/lib/db/schema";
import { BOARD_MAP, MARKET_POOL } from "@/lib/sectors/defs";
import type { PoolInfo, PoolSnapshotInfo } from "@/lib/api/types";
import { eq, inArray, sql } from "drizzle-orm";

// 頁面（server component）與 /api/pools 共用的卡池查詢
//
// 分階段載入（企劃書無關，純效能）：
// 1. 首頁只需要「卡池清單＋最新快照摘要」→ getActivePools()，3 個查詢。
// 2. 稀有度分布（rarityCounts）要掃 snapshot_stocks（每日上萬列），
//    只有 /pools、/odds、/api/pools 會顯示 → getActivePoolsWithRarity()，多 1 個查詢。
// 3. 個股明細（可抽名單）只在抽卡時由 /api/draw 載入（見 lib/gacha/service.ts）。
//
// 舊版對每個卡池各發 3 個查詢（最新快照／板塊／稀有度分布），18 池＝54 次來回；
// 在 Neon 這種跨網路的 DB 上，光是往返延遲就要數秒。改為整批查詢後為 3～4 次。

// 卡池資料每個交易日只在 cron 快照後變動一次 → 以 tag 快取，快照完成時失效
export const POOLS_CACHE_TAG = "pools";
const CACHE_TTL_SECONDS = 600;

async function loadActivePools(withRarityCounts: boolean): Promise<PoolInfo[]> {
  const activePools = await db
    .select()
    .from(pools)
    .where(eq(pools.active, true))
    .orderBy(pools.sortOrder);

  if (activePools.length === 0) return [];

  const poolIds = activePools.map((p) => p.poolId);

  // 各池最新快照：SQLite（D1）無 DISTINCT ON，整批取回後在 JS 端取最新。
  // pool_snapshots 每池每日一列（數年僅數千列），整批讀取可承受；板塊表僅十餘列故整張讀入
  const [allSnapshots, allBoards] = await Promise.all([
    db
      .select({
        poolId: poolSnapshots.poolId,
        snapshotDate: poolSnapshots.snapshotDate,
        stockCount: poolSnapshots.stockCount,
        upStockCount: poolSnapshots.upStockCount,
        downStockCount: poolSnapshots.downStockCount,
        board1dStrength: poolSnapshots.board1dStrength,
        board30dStrength: poolSnapshots.board30dStrength,
        isOpen: poolSnapshots.isOpen,
        reason: poolSnapshots.reason,
      })
      .from(poolSnapshots)
      .where(inArray(poolSnapshots.poolId, poolIds)),
    db.select().from(boards),
  ]);

  const latestSnapshots: typeof allSnapshots = [];
  const latestByPool = new Map<string, (typeof allSnapshots)[number]>();
  for (const row of allSnapshots) {
    const cur = latestByPool.get(row.poolId);
    if (!cur || row.snapshotDate > cur.snapshotDate) {
      latestByPool.set(row.poolId, row);
    }
  }
  for (const poolId of poolIds) {
    const row = latestByPool.get(poolId);
    if (row) latestSnapshots.push(row);
  }

  const snapshotByPool = new Map(latestSnapshots.map((s) => [s.poolId, s]));
  const boardByTag = new Map(allBoards.map((b) => [b.tagId, b]));

  const rarityByPool = withRarityCounts
    ? await loadRarityCounts(
        latestSnapshots.map((s) => ({
          poolId: s.poolId,
          snapshotDate: s.snapshotDate,
        })),
      )
    : new Map<string, PoolInfo["rarityCounts"]>();

  return activePools.map((pool) => {
    const snapshot = snapshotByPool.get(pool.poolId);
    const board = pool.relatedTagId ? boardByTag.get(pool.relatedTagId) : undefined;

    // 全市場池無板塊定義 → 合成 board 物件（企劃書 2.1）
    const boardInfo: PoolInfo["board"] = board
      ? {
          tagId: board.tagId,
          tagName: board.tagName,
          description: board.description,
          theme: BOARD_MAP[board.tagId]?.theme ?? null,
        }
      : pool.poolType === "market"
        ? {
            tagId: MARKET_POOL.poolCode,
            tagName: "全市場",
            description: MARKET_POOL.description,
            theme: MARKET_POOL.theme,
          }
        : null;

    const snapshotInfo: PoolSnapshotInfo | null = snapshot
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
      : null;

    const info: PoolInfo = {
      poolId: pool.poolId,
      poolCode: pool.poolCode,
      poolName: pool.poolName,
      poolType: pool.poolType,
      board: boardInfo,
      snapshot: snapshotInfo,
    };
    if (withRarityCounts) info.rarityCounts = rarityByPool.get(pool.poolId) ?? {};
    return info;
  });
}

// 各池「最新快照日」的方向×稀有度張數：一次 GROUP BY 取回所有池
async function loadRarityCounts(
  targets: { poolId: string; snapshotDate: string }[],
): Promise<Map<string, PoolInfo["rarityCounts"]>> {
  const byPool = new Map<string, PoolInfo["rarityCounts"]>();
  if (targets.length === 0) return byPool;

  // 以 (snapshot_date, pool_id) 兩個 IN 條件過濾，讓 planner 走 snapshot_stocks_pool_idx；
  // 各池快照日通常相同，少數不同步的組合在下方以 wanted 再篩一次。
  const dates = [...new Set(targets.map((t) => t.snapshotDate))];
  const poolIds = [...new Set(targets.map((t) => t.poolId))];
  const wanted = new Set(targets.map((t) => `${t.snapshotDate}|${t.poolId}`));

  const rows = await db
    .select({
      poolId: snapshotStocks.poolId,
      snapshotDate: snapshotStocks.snapshotDate,
      direction: snapshotStocks.direction,
      rarity: snapshotStocks.rarity,
      n: sql<number>`count(*)`,
    })
    .from(snapshotStocks)
    .where(
      sql`${inArray(snapshotStocks.snapshotDate, dates)} and ${inArray(snapshotStocks.poolId, poolIds)}`,
    )
    .groupBy(
      snapshotStocks.poolId,
      snapshotStocks.snapshotDate,
      snapshotStocks.direction,
      snapshotStocks.rarity,
    );

  for (const r of rows) {
    if (!wanted.has(`${r.snapshotDate}|${r.poolId}`)) continue;
    const counts = (byPool.get(r.poolId) ?? {}) as NonNullable<PoolInfo["rarityCounts"]>;
    const bucket = (counts[r.direction] ??= { C: 0, R: 0, SR: 0, SSR: 0 });
    if (r.rarity in bucket) bucket[r.rarity as keyof typeof bucket] = r.n;
    byPool.set(r.poolId, counts);
  }
  return byPool;
}

/** 卡池清單＋最新快照摘要（不含稀有度分布）。首頁用，最輕量。 */
export const getActivePools = unstable_cache(
  () => loadActivePools(false),
  ["active-pools"],
  { tags: [POOLS_CACHE_TAG], revalidate: CACHE_TTL_SECONDS },
);

/** 卡池清單＋最新快照＋各池方向×稀有度張數。/pools、/odds、/api/pools 用。 */
export const getActivePoolsWithRarity = unstable_cache(
  () => loadActivePools(true),
  ["active-pools-rarity"],
  { tags: [POOLS_CACHE_TAG], revalidate: CACHE_TTL_SECONDS },
);
