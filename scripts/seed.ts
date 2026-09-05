import { loadEnv } from "../lib/db/env";
import { BOARD_DEFS, poolIdFor } from "../lib/sectors/defs";
import { TWSE_INDUSTRY_TO_BOARD } from "../lib/sectors/industry-map";
import { sql } from "drizzle-orm";

loadEnv();

const TWSE_LIST_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";

const CODE_RE = /^[0-9]{4,6}[A-Z]?$/;

interface ListedRow {
  公司代號: string;
  公司名稱: string;
  公司簡稱?: string;
  產業別: string;
  上市日期?: string;
}

interface SeedStock {
  stockCode: string;
  name: string;
  listedDate: string | null;
}

async function fetchListedStocks(): Promise<ListedRow[]> {
  const res = await fetch(TWSE_LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TWSE API 回應 ${res.status}`);
  return (await res.json()) as ListedRow[];
}

// 民國年或西元年字串 → YYYY-MM-DD；無效回 null
function parseListedDate(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (digits.length === 7) {
    const roc = Number(digits.slice(0, 3)) + 1911;
    return `${roc}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return null;
}

async function fetchAndFilterSemi(): Promise<SeedStock[]> {
  const rows = await fetchListedStocks();
  const semi = rows.filter((r) => {
    const board = TWSE_INDUSTRY_TO_BOARD[(r.產業別 ?? "").trim()];
    return board === "SEMI" && CODE_RE.test(r.公司代號.trim());
  });
  console.log(`上市總數：${rows.length}，半導體業：${semi.length}`);
  return semi.map((r) => ({
    stockCode: r.公司代號.trim(),
    name: (r.公司簡稱 || r.公司名稱).trim(),
    listedDate: parseListedDate(r.上市日期),
  }));
}

async function dryRun(): Promise<void> {
  const semi = await fetchAndFilterSemi();
  console.log(
    "dry-run 前五檔：\n" +
      semi
        .slice(0, 5)
        .map((s) => `${s.stockCode} ${s.name}`)
        .join("\n"),
  );
}

// onConflictDoUpdate 的 excluded 參照
function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

async function seedToDb(): Promise<void> {
  const { db, client } = await import("../lib/db/client");
  const { boards, pools, stocks } = await import("../lib/db/schema");
  const { and, eq, notInArray } = await import("drizzle-orm");

  try {
    for (const [i, b] of BOARD_DEFS.entries()) {
      await db
        .insert(boards)
        .values({
          tagId: b.tagId,
          tagName: b.tagName,
          description: b.description,
          themeColor: b.theme.primary,
          active: b.active,
          sortOrder: i,
        })
        .onConflictDoUpdate({
          target: boards.tagId,
          set: {
            tagName: b.tagName,
            description: b.description,
            themeColor: b.theme.primary,
            active: b.active,
            sortOrder: i,
          },
        });
    }

    // alpha：SEMI 板塊池
    await db
      .insert(pools)
      .values({
        poolId: poolIdFor("SEMI"),
        poolCode: "SEMI",
        poolName: "半導體池",
        poolType: "board",
        relatedTagId: "SEMI",
        active: true,
        minStockCount: 30,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: pools.poolId,
        set: { poolName: "半導體池", active: true, minStockCount: 30 },
      });
    console.log("板塊與卡池 seeded（16 板塊、SEMI 池啟用）");

    const semi = await fetchAndFilterSemi();
    for (let i = 0; i < semi.length; i += 200) {
      await db
        .insert(stocks)
        .values(
          semi.slice(i, i + 200).map((s) => ({
            stockCode: s.stockCode,
            name: s.name,
            market: "twse" as const,
            boardCode: "SEMI" as const,
            listedDate: s.listedDate,
            active: true,
          })),
        )
        .onConflictDoUpdate({
          target: stocks.stockCode,
          set: {
            name: sqlExcluded("name"),
            market: sqlExcluded("market"),
            boardCode: sqlExcluded("board_code"),
            listedDate: sqlExcluded("listed_date"),
            active: sqlExcluded("active"),
            updatedAt: new Date(),
          },
        });
    }

    // 曾屬 SEMI 但已不在清單者停用
    const codes = semi.map((s) => s.stockCode);
    await db
      .update(stocks)
      .set({ active: false })
      .where(
        and(eq(stocks.boardCode, "SEMI"), notInArray(stocks.stockCode, codes)),
      );

    const [cnt] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(stocks)
      .where(and(eq(stocks.active, true), eq(stocks.boardCode, "SEMI")));
    console.log(`股票 seeded：${semi.length} 檔；DB 驗證：SEMI 啟用 ${cnt.c} 檔`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    await dryRun();
  } else {
    await seedToDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
