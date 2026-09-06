import { loadEnv } from "../lib/db/env";
import { BOARD_DEFS, MARKET_POOL, poolIdFor } from "../lib/sectors/defs";
import { TWSE_INDUSTRY_TO_BOARD } from "../lib/sectors/industry-map";
import { AI_CURATED_CODES } from "../lib/sectors/ai-curate";
import { sql } from "drizzle-orm";

loadEnv();

const TWSE_LIST_URL = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";

// 上市普通股代號（4–6 位數字）；91 產業別＝存託憑證（TDR），非普通股，排除
const CODE_RE = /^[0-9]{4,6}$/;
const TDR_INDUSTRY = "91";

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
  boardCode: string | null; // 主板塊（產業別映射；策展池不算主板塊）
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

// 撈全市場上市清單，依混合映射分組（企劃書 3.1 產業＋主題混合）
async function fetchAllListed(): Promise<SeedStock[]> {
  const rows = await fetchListedStocks();
  const stocks = rows
    .filter((r) => {
      const code = r.公司代號.trim();
      const ind = (r.產業別 ?? "").trim();
      return CODE_RE.test(code) && ind !== TDR_INDUSTRY && ind !== "";
    })
    .map((r) => ({
      stockCode: r.公司代號.trim(),
      name: (r.公司簡稱 || r.公司名稱).trim(),
      listedDate: parseListedDate(r.上市日期),
      boardCode: TWSE_INDUSTRY_TO_BOARD[(r.產業別 ?? "").trim()] ?? null,
    }));
  console.log(`上市總數：${rows.length}，普通股（排除 TDR）：${stocks.length}`);
  return stocks;
}

// onConflictDoUpdate 的 excluded 參照
function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

// dry-run：印出各板塊分布與 AI 策展比對，不動 DB
async function dryRun(): Promise<void> {
  const all = await fetchAllListed();
  const byBoard = new Map<string, number>();
  for (const s of all) {
    if (s.boardCode) byBoard.set(s.boardCode, (byBoard.get(s.boardCode) ?? 0) + 1);
  }
  const codes = new Set(all.map((s) => s.stockCode));
  const aiValid = AI_CURATED_CODES.filter((c) => codes.has(c));
  console.log(
    "各板塊檔數：\n" +
      BOARD_DEFS.map((b) => {
        const n = byBoard.get(b.tagId) ?? 0;
        return `  ${b.tagId.padEnd(6)}${String(n).padStart(5)}　${b.tagName}`;
      }).join("\n"),
  );
  console.log(`AI 策展：${aiValid.length}/${AI_CURATED_CODES.length} 檔存在於上市清單`);
  const unmapped = all.filter((s) => !s.boardCode).length;
  console.log(`無板塊歸屬（僅進全市場池）：${unmapped} 檔`);
  console.log(
    "dry-run 前五檔：\n" +
      all
        .slice(0, 5)
        .map((s) => `${s.stockCode} ${s.name} ${s.boardCode ?? "—"}`)
        .join("\n"),
  );
}

async function seedToDb(): Promise<void> {
  const { db, client } = await import("../lib/db/client");
  const { boards, pools, stocks, stockBoards } = await import("../lib/db/schema");
  const { and, eq, notInArray } = await import("drizzle-orm");

  try {
    // 1) 板塊定義（16 板塊）
    for (const [i, b] of BOARD_DEFS.entries()) {
      await db
        .insert(boards)
        .values({
          tagId: b.tagId,
          tagName: b.tagName,
          description: b.description,
          themeColor: b.theme.primary,
          active: b.active,
          sortOrder: i + 1, // 0 留給全市場池
        })
        .onConflictDoUpdate({
          target: boards.tagId,
          set: {
            tagName: b.tagName,
            description: b.description,
            themeColor: b.theme.primary,
            active: b.active,
            sortOrder: i + 1,
          },
        });
    }

    // 2) 卡池：全市場池（企劃書 2.1）＋ 各板塊池（企劃書 16.3）
    await db
      .insert(pools)
      .values({
        poolId: MARKET_POOL.poolId,
        poolCode: MARKET_POOL.poolCode,
        poolName: MARKET_POOL.poolName,
        poolType: MARKET_POOL.poolType,
        relatedTagId: null,
        active: true,
        minStockCount: MARKET_POOL.minStockCount,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: pools.poolId,
        set: {
          poolName: MARKET_POOL.poolName,
          active: true,
          minStockCount: MARKET_POOL.minStockCount,
        },
      });

    for (const b of BOARD_DEFS.filter((x) => x.active)) {
      await db
        .insert(pools)
        .values({
          poolId: poolIdFor(b.tagId),
          poolCode: b.tagId,
          poolName: `${b.tagName}池`,
          poolType: "board",
          relatedTagId: b.tagId,
          active: true,
          // 卡池常態開放（無鎖池設計）；min_stock_count 僅為營運配置欄位（企劃書 16.3）
          minStockCount: 30,
          sortOrder: BOARD_DEFS.indexOf(b) + 1,
        })
        .onConflictDoUpdate({
          target: pools.poolId,
          set: {
            poolName: `${b.tagName}池`,
            active: true,
            minStockCount: 30,
          },
        });
    }
    const activeBoards = BOARD_DEFS.filter((b) => b.active);
    console.log(
      `板塊與卡池 seeded（${BOARD_DEFS.length} 板塊、${activeBoards.length} 板塊池＋全市場池啟用）`,
    );

    // 3) 股票：全市場上市普通股（無板塊歸屬者也入庫，僅進全市場池）
    const all = await fetchAllListed();
    for (let i = 0; i < all.length; i += 200) {
      await db
        .insert(stocks)
        .values(
          all.slice(i, i + 200).map((s) => ({
            stockCode: s.stockCode,
            name: s.name,
            market: "twse" as const,
            boardCode: s.boardCode,
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

    // 已不在清單者停用（含舊 alpha SEMI 名單）
    const codes = all.map((s) => s.stockCode);
    await db
      .update(stocks)
      .set({ active: false })
      .where(notInArray(stocks.stockCode, codes));

    // 4) 股票↔板塊映射（企劃書 16.2）：產業別主板塊 ＋ AI 策展副板塊
    const mappings: { stockCode: string; tagId: string; isPrimary: boolean }[] = [];
    for (const s of all) {
      if (s.boardCode) {
        mappings.push({ stockCode: s.stockCode, tagId: s.boardCode, isPrimary: true });
      }
    }
    const codeSet = new Set(codes);
    const aiValid = AI_CURATED_CODES.filter((c) => codeSet.has(c));
    for (const c of aiValid) {
      mappings.push({ stockCode: c, tagId: "AI", isPrimary: false });
    }
    for (let i = 0; i < mappings.length; i += 500) {
      await db
        .insert(stockBoards)
        .values(mappings.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [stockBoards.stockCode, stockBoards.tagId],
          set: {
            isPrimary: sqlExcluded("is_primary"),
            updatedAt: new Date(),
          },
        });
    }
    // 清掉已不在清單的映射，以及不再策展的 AI 映射
    await db.delete(stockBoards).where(notInArray(stockBoards.stockCode, codes));
    if (aiValid.length > 0) {
      await db
        .delete(stockBoards)
        .where(
          and(eq(stockBoards.tagId, "AI"), notInArray(stockBoards.stockCode, aiValid)),
        );
    } else {
      await db.delete(stockBoards).where(eq(stockBoards.tagId, "AI"));
    }
    console.log(
      `股票 seeded：${all.length} 檔；映射 ${mappings.length} 筆（AI 策展 ${aiValid.length} 檔）`,
    );

    // 5) 驗證
    for (const b of activeBoards) {
      const [cnt] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(stockBoards)
        .where(eq(stockBoards.tagId, b.tagId));
      console.log(`  ${b.tagName}池：${cnt.c} 檔`);
    }
    const [allCnt] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(stocks)
      .where(eq(stocks.active, true));
    console.log(`DB 驗證：活躍股票 ${allCnt.c} 檔（全市場池）`);
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
