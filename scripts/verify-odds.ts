import { loadEnv } from "../lib/db/env";
import { mulberry32 } from "../lib/gacha/rng";
import {
  buildPoolState,
  drawOnce,
  RARITY_LIST,
  type DrawResult,
} from "../lib/gacha/engine";
import { RARITY_TARGETS, type Rarity } from "../lib/gacha/rarity";

loadEnv();

// 機率驗證：對真實最新快照模擬 10 萬抽
// 企劃書 9.2 動態方向機率、9.4 稀有度目標 80/15/4/1、10.2 空池降級補償
async function main() {
  const { db, client } = await import("../lib/db/client");
  const { poolSnapshots, snapshotStocks, pools } = await import(
    "../lib/db/schema"
  );
  const { and, desc, eq } = await import("drizzle-orm");

  try {
    const [pool] = await db
      .select()
      .from(pools)
      .where(eq(pools.poolId, "POOL_SEMI"));
    if (!pool) throw new Error("POOL_SEMI 不存在，請先 seed");

    const [snapshot] = await db
      .select()
      .from(poolSnapshots)
      .where(
        and(
          eq(poolSnapshots.poolId, pool.poolId),
          eq(poolSnapshots.isOpen, true),
        ),
      )
      .orderBy(desc(poolSnapshots.snapshotDate))
      .limit(1);
    if (!snapshot) throw new Error("無開放快照");

    const rows = await db
      .select({
        stockCode: snapshotStocks.stockCode,
        direction: snapshotStocks.direction,
        rarity: snapshotStocks.rarity,
        weight: snapshotStocks.weight,
      })
      .from(snapshotStocks)
      .where(
        and(
          eq(snapshotStocks.snapshotDate, snapshot.snapshotDate),
          eq(snapshotStocks.poolId, pool.poolId),
        ),
      );

    const state = buildPoolState(rows);
    const upRate = state.upStockCount / (state.upStockCount + state.downStockCount);
    console.log(
      `池：${pool.poolName} 快照：${snapshot.snapshotDate} 可抽：${rows.length} 漲/跌：${state.upStockCount}/${state.downStockCount}`,
    );
    console.log(`目標方向機率：上漲 ${(upRate * 100).toFixed(2)}%`);

    const N = 100_000;
    const rng = mulberry32(20260906);
    const finalByDir: Record<string, Record<Rarity, number>> = {
      UP: { C: 0, R: 0, SR: 0, SSR: 0 },
      DOWN: { C: 0, R: 0, SR: 0, SSR: 0 },
    };
    let downgradeEvents = 0;

    for (let i = 0; i < N; i++) {
      let drawn: DrawResult | null = null;
      for (let a = 0; a < 3; a++) {
        drawn = drawOnce(state, rng);
        if (drawn) break;
      }
      if (!drawn) throw new Error("方向空池異常");
      finalByDir[drawn.direction][drawn.finalRarity]++;
      if (drawn.rolledRarity !== drawn.finalRarity) downgradeEvents++;
    }

    // 期望值：稀有度桶完整者為目標機率；缺桶時由降級補償加總
    const has = (dir: string, r: Rarity) =>
      (state.buckets.get(`${dir}:${r}`)?.length ?? 0) > 0;

    let fail = false;
    const check = (label: string, actual: number, expected: number, tol: number) => {
      const diff = Math.abs(actual - expected);
      const ok = diff <= tol;
      if (!ok) fail = true;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${label}：實際 ${(actual * 100).toFixed(3)}%　預期 ${(expected * 100).toFixed(3)}%　誤差 ${(diff * 100).toFixed(3)}%（容許 ${(tol * 100).toFixed(3)}%）`,
      );
    };

    const checkDir = (dir: "UP" | "DOWN") => {
      const total =
        finalByDir[dir].C +
        finalByDir[dir].R +
        finalByDir[dir].SR +
        finalByDir[dir].SSR;
      const expectedDirRate = dir === "UP" ? upRate : 1 - upRate;
      check(
        `${dir} 方向率`,
        total / N,
        expectedDirRate,
        0.005,
      );
      for (const rarity of RARITY_LIST) {
        const chain: Rarity[] = ["SSR", "SR", "R", "C"];
        if (!has(dir, rarity)) {
          // 缺桶：理論上不應抽出該稀有度
          check(
            `${dir} ${rarity}（應為 0）`,
            finalByDir[dir][rarity] / total,
            0,
            0.0001,
          );
          continue;
        }
        // 期望 = 自身目標 + 上方所有「途中桶全空」之稀有度降級流入
        let expected = RARITY_TARGETS[rarity];
        const yi = chain.indexOf(rarity);
        for (let zi = 0; zi < yi; zi++) {
          const z = chain[zi];
          if (has(dir, z)) continue;
          const between = chain.slice(zi + 1, yi);
          if (between.every((b) => !has(dir, b))) expected += RARITY_TARGETS[z];
        }
        check(`${dir} ${rarity}`, finalByDir[dir][rarity] / total, expected, 0.003);
      }
    };

    checkDir("UP");
    checkDir("DOWN");
    console.log(`空池降級事件：${downgradeEvents} 次 / ${N} 抽`);
    console.log(fail ? "驗證失敗" : "機率驗證全部通過");
    if (fail) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
