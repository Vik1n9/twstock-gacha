# 卡片變動標記 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓卡片詳情顯示「稀有度是哪一天、從哪一階變過來的」與「方向是哪一天翻的」，資料由每日快照逐日沿用產生。

**Architecture:** `snapshot_stocks` 新增三個可為 null 的欄位（`prev_rarity`、`rarity_changed_on`、`direction_changed_on`）。每日 cron 生成快照時，拿前一個快照日的同一檔股票比對：狀態相同就繼承舊值，不同就寫入今天。判斷邏輯抽成純函式 `resolveChangeMarks`，顯示字串抽成純函式模組 `lib/cards/marks.ts`，兩者都在現成的 vitest（node 環境）下測試，不需要 jsdom。

**Tech Stack:** TypeScript、Drizzle ORM（`drizzle-orm/sqlite-core`）、Cloudflare D1、Next.js 16 App Router（vinext）、vitest、wrangler。

## Global Constraints

- 設計來源：`docs/superpowers/specs/2026-09-07-rarity-change-design.md`。有衝突以 spec 為準。
- 追兩條**互相獨立**的變動史：稀有度升降掛「稀有度」列，方向翻轉掛「30 日漲跌」列。稀有度變動不更新方向日期，反之亦然。
- 稀有度與方向都只由 `change30d` 決定、與卡池無關，因此以 `stock_code` 取一次前值，17 個池寫入同一組值。
- 「上一個快照日」＝`pool_snapshots` 中小於今日的最大 `snapshot_date`，**不是**前一個日曆日。
- 沒有變動紀錄（值為 null）時，該列維持原本內容，不加任何前綴。
- 顯示字串逐字照這個規格，全形括號、全形空白：
  - 稀有度降階：`（09-07）自R卡降階`
  - 稀有度升階：`（09-07）自C卡升階`
  - 方向翻成跌：`（09-07）翻黑`
  - 方向翻成漲：`（09-07）轉白`
- 日期格式：與該卡資料日**同年**只寫 `09-07`，**跨年**寫完整 `2025-09-07`。
- D1 單查詢上限 100 個綁定參數。`snapshot_stocks` 由 11 欄變 14 欄，upsert 批次必須由每批 9 列改為 **7 列**（7 × 14 = 98）。
- 分支：`feat/rarity-change-marks`（已建立）。每個 Task 結束時 commit。
- 所有指令用 `rtk` 前綴（見 `CLAUDE.md`）。

---

### Task 1: 變動判斷純函式

**Files:**
- Modify: `lib/pool/snapshot.ts`
- Test: `lib/pool/snapshot.test.ts`

**Interfaces:**
- Consumes: `Direction`、`Rarity`（`lib/gacha/rarity.ts`，`snapshot.ts` 已 import `Direction`／`Rarity` 型別）
- Produces:
  - `interface ChangeMarks { prevRarity: Rarity | null; rarityChangedOn: string | null; directionChangedOn: string | null }`
  - `interface PrevMarkRow { direction: Direction; rarity: Rarity; prevRarity: Rarity | null; rarityChangedOn: string | null; directionChangedOn: string | null }`
  - `resolveChangeMarks(prev: PrevMarkRow | undefined, current: { direction: Direction; rarity: Rarity }, snapshotDate: string): ChangeMarks`

- [ ] **Step 1: 寫失敗測試**

在 `lib/pool/snapshot.test.ts` 檔案最後加上：

```ts
describe("resolveChangeMarks（變動標記逐日沿用）", () => {
  const prev = (
    o: Partial<PrevMarkRow> & { direction: "UP" | "DOWN"; rarity: "C" | "R" | "SR" | "SSR" },
  ): PrevMarkRow => ({
    prevRarity: null,
    rarityChangedOn: null,
    directionChangedOn: null,
    ...o,
  });

  it("沒有前一個快照日：三欄皆 null", () => {
    expect(
      resolveChangeMarks(undefined, { direction: "UP", rarity: "R" }, "2026-09-07"),
    ).toEqual({
      prevRarity: null,
      rarityChangedOn: null,
      directionChangedOn: null,
    });
  });

  it("稀有度改變：記下前一階與今天", () => {
    const r = resolveChangeMarks(
      prev({ direction: "DOWN", rarity: "R" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-07");
  });

  it("稀有度不變且前值為 null：仍是 null（不知道何時開始）", () => {
    const r = resolveChangeMarks(
      prev({ direction: "UP", rarity: "C" }),
      { direction: "UP", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBeNull();
    expect(r.rarityChangedOn).toBeNull();
  });

  it("稀有度不變且前值有紀錄：整組繼承，不被今天蓋掉", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "SR",
        prevRarity: "R",
        rarityChangedOn: "2026-09-04",
      }),
      { direction: "UP", rarity: "SR" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-04");
  });

  it("方向翻轉：記下今天", () => {
    const r = resolveChangeMarks(
      prev({ direction: "UP", rarity: "C" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.directionChangedOn).toBe("2026-09-07");
  });

  it("方向不變：繼承舊日期", () => {
    const r = resolveChangeMarks(
      prev({ direction: "DOWN", rarity: "C", directionChangedOn: "2026-08-20" }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.directionChangedOn).toBe("2026-08-20");
  });

  it("稀有度變、方向沒變：只動稀有度那組", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "R",
        prevRarity: "C",
        rarityChangedOn: "2026-08-28",
        directionChangedOn: "2026-08-20",
      }),
      { direction: "UP", rarity: "SR" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-09-07");
    expect(r.directionChangedOn).toBe("2026-08-20");
  });

  it("方向變、稀有度沒變：只動方向那組", () => {
    const r = resolveChangeMarks(
      prev({
        direction: "UP",
        rarity: "C",
        prevRarity: "R",
        rarityChangedOn: "2026-08-28",
        directionChangedOn: "2026-08-20",
      }),
      { direction: "DOWN", rarity: "C" },
      "2026-09-07",
    );
    expect(r.prevRarity).toBe("R");
    expect(r.rarityChangedOn).toBe("2026-08-28");
    expect(r.directionChangedOn).toBe("2026-09-07");
  });
});
```

同時把檔案第 2 行的 import 改成（加入本次要測的兩個名字）：

```ts
import {
  computeStockMetrics,
  gatePool,
  resolveChangeMarks,
  type PrevMarkRow,
} from "./snapshot";
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `rtk npx vitest run lib/pool/snapshot.test.ts`
Expected: FAIL，訊息類似 `"resolveChangeMarks" is not exported by "lib/pool/snapshot.ts"`

- [ ] **Step 3: 實作**

在 `lib/pool/snapshot.ts` 的 `computeStockMetrics` 之後、`PoolGateResult` 之前插入：

```ts
// 卡片變動標記：稀有度升降與方向翻轉各自獨立計日。
// 逐日沿用而非回頭重算——狀態相同就繼承前一個快照日的值，不同才寫入今天。
// 前值為 null 代表「不知道何時開始」（這一檔在有這個欄位之前就已是這個狀態），
// 顯示端會略過該段文字。
export interface ChangeMarks {
  prevRarity: Rarity | null;
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
}

export interface PrevMarkRow extends ChangeMarks {
  direction: Direction;
  rarity: Rarity;
}

export function resolveChangeMarks(
  prev: PrevMarkRow | undefined,
  current: { direction: Direction; rarity: Rarity },
  snapshotDate: string,
): ChangeMarks {
  if (!prev) {
    return { prevRarity: null, rarityChangedOn: null, directionChangedOn: null };
  }
  const rarityChanged = prev.rarity !== current.rarity;
  const directionChanged = prev.direction !== current.direction;
  return {
    prevRarity: rarityChanged ? prev.rarity : prev.prevRarity,
    rarityChangedOn: rarityChanged ? snapshotDate : prev.rarityChangedOn,
    directionChangedOn: directionChanged
      ? snapshotDate
      : prev.directionChangedOn,
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `rtk npx vitest run lib/pool/snapshot.test.ts`
Expected: PASS，該檔共 14 個測試（原有 6 個 ＋ 新增 8 個）

- [ ] **Step 5: Commit**

```bash
rtk git add lib/pool/snapshot.ts lib/pool/snapshot.test.ts && rtk git commit -m "feat: 變動標記判斷純函式 resolveChangeMarks

稀有度升降與方向翻轉各自獨立計日，狀態相同就繼承前一快照日的值。"
```

---

### Task 2: 顯示字串純函式

**Files:**
- Create: `lib/cards/marks.ts`
- Test: `lib/cards/marks.test.ts`

**Interfaces:**
- Consumes: `RARITY_RANK`、`Rarity`（`lib/fx/core.ts`。該檔無 top-level DOM 存取，可在 node 環境下 import）
- Produces:
  - `fmtChangeDate(changedOn: string, refDate: string): string`
  - `rarityChangeMark(prevRarity: Rarity | null | undefined, rarity: Rarity, changedOn: string | null | undefined, refDate: string | null | undefined): string | null`
  - `directionChangeMark(direction: "UP" | "DOWN", changedOn: string | null | undefined, refDate: string | null | undefined): string | null`

- [ ] **Step 1: 寫失敗測試**

建立 `lib/cards/marks.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { directionChangeMark, fmtChangeDate, rarityChangeMark } from "./marks";

describe("fmtChangeDate", () => {
  it("同年只寫月日", () => {
    expect(fmtChangeDate("2026-09-07", "2026-09-07")).toBe("09-07");
    expect(fmtChangeDate("2026-01-02", "2026-12-31")).toBe("01-02");
  });

  it("跨年寫完整年月日", () => {
    expect(fmtChangeDate("2025-09-07", "2026-09-07")).toBe("2025-09-07");
  });
});

describe("rarityChangeMark", () => {
  it("降階", () => {
    expect(rarityChangeMark("R", "C", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自R卡降階",
    );
  });

  it("升階", () => {
    expect(rarityChangeMark("C", "R", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自C卡升階",
    );
  });

  it("跨兩階仍只寫起點", () => {
    expect(rarityChangeMark("SSR", "R", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）自SSR卡降階",
    );
  });

  it("跨年寫完整日期", () => {
    expect(rarityChangeMark("R", "C", "2025-11-20", "2026-09-07")).toBe(
      "（2025-11-20）自R卡降階",
    );
  });

  it("缺任何一項就回 null", () => {
    expect(rarityChangeMark(null, "C", "2026-09-07", "2026-09-07")).toBeNull();
    expect(rarityChangeMark("R", "C", null, "2026-09-07")).toBeNull();
    expect(rarityChangeMark("R", "C", "2026-09-07", null)).toBeNull();
    expect(rarityChangeMark(undefined, "C", undefined, undefined)).toBeNull();
  });

  it("前後同階視為無變動（資料異常的防線）", () => {
    expect(rarityChangeMark("C", "C", "2026-09-07", "2026-09-07")).toBeNull();
  });
});

describe("directionChangeMark", () => {
  it("翻成跌＝翻黑", () => {
    expect(directionChangeMark("DOWN", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）翻黑",
    );
  });

  it("翻成漲＝轉白", () => {
    expect(directionChangeMark("UP", "2026-09-07", "2026-09-07")).toBe(
      "（09-07）轉白",
    );
  });

  it("沒有翻轉紀錄回 null", () => {
    expect(directionChangeMark("UP", null, "2026-09-07")).toBeNull();
    expect(directionChangeMark("UP", "2026-09-07", null)).toBeNull();
    expect(directionChangeMark("DOWN", undefined, undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `rtk npx vitest run lib/cards/marks.test.ts`
Expected: FAIL，訊息類似 `Failed to resolve import "./marks"`

- [ ] **Step 3: 實作**

建立 `lib/cards/marks.ts`：

```ts
import { RARITY_RANK, type Rarity } from "../fx/core";

// 卡片詳情的變動標記文字。純字串組裝，不碰 DOM，因此可在 node 環境下測試。
// 資料來源是 snapshot_stocks 的 prev_rarity / rarity_changed_on /
// direction_changed_on（見 lib/pool/snapshot.ts 的 resolveChangeMarks）。

// 與參考日同年只寫月日，跨年寫完整年月日。
// 只寫月日的話，一檔一年多沒變動的股票會分不出是哪一年。
export function fmtChangeDate(changedOn: string, refDate: string): string {
  return changedOn.slice(0, 4) === refDate.slice(0, 4)
    ? changedOn.slice(5)
    : changedOn;
}

// 「（09-07）自R卡降階」。沒有變動紀錄回 null，呼叫端不顯示這段。
export function rarityChangeMark(
  prevRarity: Rarity | null | undefined,
  rarity: Rarity,
  changedOn: string | null | undefined,
  refDate: string | null | undefined,
): string | null {
  if (!prevRarity || !changedOn || !refDate) return null;
  if (prevRarity === rarity) return null;
  const move = RARITY_RANK[rarity] > RARITY_RANK[prevRarity] ? "升階" : "降階";
  return `（${fmtChangeDate(changedOn, refDate)}）自${prevRarity}卡${move}`;
}

// 「（09-07）翻黑」／「（09-07）轉白」。沒有翻轉紀錄回 null。
// 方向決定卡片框體：DOWN 是黑邊暗卡，UP 用稀有度色描邊（見 StockCard.tsx）。
export function directionChangeMark(
  direction: "UP" | "DOWN",
  changedOn: string | null | undefined,
  refDate: string | null | undefined,
): string | null {
  if (!changedOn || !refDate) return null;
  const word = direction === "DOWN" ? "翻黑" : "轉白";
  return `（${fmtChangeDate(changedOn, refDate)}）${word}`;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `rtk npx vitest run lib/cards/marks.test.ts`
Expected: PASS，12 個測試

- [ ] **Step 5: Commit**

```bash
rtk git add lib/cards/marks.ts lib/cards/marks.test.ts && rtk git commit -m "feat: 卡片變動標記的顯示字串純函式

同年只寫月日、跨年寫完整日期；缺任一欄位回 null 讓呼叫端略過。"
```

---

### Task 3: Schema 與 migration

**Files:**
- Modify: `lib/db/schema.ts:122`（`export const snapshotStocks`，`drawable` 欄位在 `lib/db/schema.ts:135`）
- Create: `drizzle/0002_snapshot-stocks-change-marks.sql`

**Interfaces:**
- Consumes: Task 1 的欄位語意
- Produces: `snapshotStocks.prevRarity`、`snapshotStocks.rarityChangedOn`、`snapshotStocks.directionChangedOn`（皆為 `text(...)`，可為 null）

- [ ] **Step 1: 改 schema**

在 `lib/db/schema.ts` 的 `snapshotStocks` 定義中，把 `change1d` 那一行下方（`close` 之前）不動，改為在 `drawable` 之後、閉合括號 `},` 之前插入三欄：

```ts
    drawable: booleanCol("drawable").notNull().default(true),
    // 變動標記（見 lib/pool/snapshot.ts 的 resolveChangeMarks）：
    // 由每日快照逐日沿用，不回頭重算。null＝這一檔在有這些欄位之前就已是
    // 目前的狀態，不知道何時開始，顯示端會略過。
    prevRarity: text("prev_rarity"), // 上一個不同的稀有度
    rarityChangedOn: text("rarity_changed_on"), // 變成現在這個稀有度的日期
    directionChangedOn: text("direction_changed_on"), // 方向翻成現在這個方向的日期
```

- [ ] **Step 2: 建立 migration SQL**

建立 `drizzle/0002_snapshot-stocks-change-marks.sql`：

```sql
ALTER TABLE `snapshot_stocks` ADD `prev_rarity` text;
ALTER TABLE `snapshot_stocks` ADD `rarity_changed_on` text;
ALTER TABLE `snapshot_stocks` ADD `direction_changed_on` text;
```

- [ ] **Step 3: 套用到本機 D1**

Run: `rtk npx wrangler d1 execute twstock-gacha --local --file ./drizzle/0002_snapshot-stocks-change-marks.sql --yes`
Expected: 三條 statement 成功，無錯誤

- [ ] **Step 4: 驗證欄位存在**

Run: `rtk npx wrangler d1 execute twstock-gacha --local --command "SELECT prev_rarity, rarity_changed_on, direction_changed_on FROM snapshot_stocks LIMIT 1"`
Expected: 回一列、三欄皆為 null（不是 `no such column` 錯誤）

- [ ] **Step 5: typecheck**

Run: `rtk npm run typecheck 2>&1 | grep -v "^\.next/"`
Expected: 沒有任何 `error TS` 行（`.next/types/validator.ts` 的 4 個錯誤是既有的產生檔問題，已過濾掉）

- [ ] **Step 6: Commit**

```bash
rtk git add lib/db/schema.ts drizzle/0002_snapshot-stocks-change-marks.sql && rtk git commit -m "feat: snapshot_stocks 新增變動標記三欄

prev_rarity / rarity_changed_on / direction_changed_on，皆可為 null。"
```

---

### Task 4: 快照生成寫入變動標記

**Files:**
- Modify: `lib/pool/generate.ts`

**Interfaces:**
- Consumes: `resolveChangeMarks`、`PrevMarkRow`（Task 1）、schema 三欄（Task 3）
- Produces: 每次 `generatePoolSnapshots(date)` 執行後，該日所有 `snapshot_stocks` 列都帶正確的三欄值

- [ ] **Step 1: 補 import**

`lib/pool/generate.ts` 頂部有兩處要改。

第一處，把 `./snapshot` 的 import 改成：

```ts
import {
  computeStockMetrics,
  gatePool,
  resolveChangeMarks,
  type PrevMarkRow,
  type StockMetrics,
} from "./snapshot";
```

第二處，把 drizzle 的 import 加上 `lt`：

```ts
import { and, eq, gte, lt, lte, desc, inArray } from "drizzle-orm";
```

- [ ] **Step 2: 讀前一個快照日的變動標記**

在 `generatePoolSnapshots` 內，`const summaries: GenerateSummary[] = [];` 這一行**之前**插入：

```ts
  // 前一個快照日的變動標記。稀有度與方向都只由 change30d 決定、與卡池無關，
  // 因此以 stock_code 取一次，17 個池共用同一組值——每池各算的話，個股新進
  // 某池時會在該池顯示不同的變動日。
  // 「上一個快照日」取 pool_snapshots 中小於今日的最大日期，不是前一個日曆日，
  // 連假或停市才不會被誤判成一次變動。
  const [prevSnapshot] = await db
    .select({ date: poolSnapshots.snapshotDate })
    .from(poolSnapshots)
    .where(lt(poolSnapshots.snapshotDate, snapshotDate))
    .orderBy(desc(poolSnapshots.snapshotDate))
    .limit(1);

  const prevMarks = new Map<string, PrevMarkRow>();
  if (prevSnapshot) {
    const prevRows = await db
      .select({
        stockCode: snapshotStocks.stockCode,
        direction: snapshotStocks.direction,
        rarity: snapshotStocks.rarity,
        prevRarity: snapshotStocks.prevRarity,
        rarityChangedOn: snapshotStocks.rarityChangedOn,
        directionChangedOn: snapshotStocks.directionChangedOn,
      })
      .from(snapshotStocks)
      .where(eq(snapshotStocks.snapshotDate, prevSnapshot.date));
    for (const r of prevRows) {
      // 同一檔會在多個池各有一列，值相同，取第一列即可
      if (prevMarks.has(r.stockCode)) continue;
      prevMarks.set(r.stockCode, {
        direction: r.direction as PrevMarkRow["direction"],
        rarity: r.rarity as PrevMarkRow["rarity"],
        prevRarity: r.prevRarity as PrevMarkRow["prevRarity"],
        rarityChangedOn: r.rarityChangedOn,
        directionChangedOn: r.directionChangedOn,
      });
    }
  }
```

- [ ] **Step 3: 批次大小 9 → 7，並寫入三欄**

在 `lib/pool/generate.ts` 找到這段註解與迴圈：

```ts
    // D1 單查詢上限 100 個綁定參數：snapshot_stocks 每列 11 欄 → 每批最多 9 列
    const upserts: BatchStatements = [];
    for (let i = 0; i < metrics.length; i += 9) {
```

整段（含 `.values(...)` 與 `.onConflictDoUpdate(...)`）替換為：

```ts
    // D1 單查詢上限 100 個綁定參數：snapshot_stocks 每列 14 欄 → 每批最多 7 列
    // （7 × 14 = 98）。加欄位時這個數字要一起改，否則整批 upsert 會被 D1 拒絕。
    const upserts: BatchStatements = [];
    for (let i = 0; i < metrics.length; i += 7) {
      upserts.push(
        db
          .insert(snapshotStocks)
          .values(
            metrics.slice(i, i + 7).map((m) => ({
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
              ...resolveChangeMarks(
                prevMarks.get(m.stockCode),
                m,
                snapshotDate,
              ),
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
              prevRarity: sql`excluded.prev_rarity`,
              rarityChangedOn: sql`excluded.rarity_changed_on`,
              directionChangedOn: sql`excluded.direction_changed_on`,
            },
          }),
      );
    }
```

- [ ] **Step 4: typecheck 與既有測試**

Run: `rtk npm run typecheck 2>&1 | grep -v "^\.next/" ; rtk npm test`
Expected: 沒有 `error TS` 行；vitest 全數通過

- [ ] **Step 5: 對本機 D1 端對端實跑一次快照**

`npm run snapshot` 在 tsx 下一律走 D1 HTTP API（＝正式庫，見 `lib/db/client.ts`
的 `resolveDb`），**不能**用它驗本機。改走 `npm run start`：那是 `wrangler dev`
跑建置後的 Worker，D1 用的是本機的 `.wrangler/state`。

本機現況：`stock_prices` 到 `2026-09-04`、`snapshot_stocks` 只有 `2026-09-04`
一天。打本機的 cron 端點會抓 TWSE 最新交易日（`2026-09-07`）入庫並生成快照，
前一個快照日正好取到 `2026-09-04`——這就是正式環境會發生的完整情境。

先確認起點：

Run: `rtk npx wrangler d1 execute twstock-gacha --local --command "SELECT snapshot_date, COUNT(*) n FROM snapshot_stocks GROUP BY snapshot_date"`
Expected: 只有 `2026-09-04` 一列

建置並啟動（`npm run start` 需要背景執行，佔用 port 8787）：

```bash
rtk npm run build && rtk npm run start
```

另開一個 shell，帶上 `.dev.vars` 裡的 `CRON_SECRET` 呼叫端點：

```bash
rtk npx tsx -e "
import { readFileSync } from 'node:fs';
const secret = readFileSync('.dev.vars','utf8').split('=')[1].trim();
fetch('http://localhost:8787/api/cron/snapshot', { headers: { authorization: 'Bearer ' + secret } })
  .then(r => r.text()).then(t => console.log(t.slice(0, 400)));
"
```
Expected: JSON 回應含 `"snapshotDate":"2026-09-07"` 與 17 個池的摘要，無 `error`

- [ ] **Step 6: 驗證變動標記真的寫進本機 D1**

Run:
```bash
rtk npx wrangler d1 execute twstock-gacha --local --command "SELECT COUNT(*) total, SUM(rarity_changed_on IS NOT NULL) rarity_marked, SUM(direction_changed_on IS NOT NULL) dir_marked FROM snapshot_stocks WHERE snapshot_date='2026-09-07' AND pool_id='POOL_ALL'"
```
Expected: `total` 約 1079、`rarity_marked` **193**、`dir_marked` **95**
（這兩個數字是 09-04 → 09-07 的實際變動檔數，已從正式資料查證過）

再抽驗一檔已知的降階股票（3003 健和興：09-04 是 R/UP、09-07 是 C/DOWN，兩項都變）：

```bash
rtk npx wrangler d1 execute twstock-gacha --local --command "SELECT stock_code, prev_rarity, rarity, rarity_changed_on, direction, direction_changed_on FROM snapshot_stocks WHERE snapshot_date='2026-09-07' AND pool_id='POOL_ALL' AND stock_code='3003'"
```
Expected: `prev_rarity=R`、`rarity=C`、`rarity_changed_on=2026-09-07`、`direction=DOWN`、`direction_changed_on=2026-09-07`

以及一檔只變稀有度、方向沒變的（2409 友達：09-04 R/UP → 09-07 SR/UP）：

```bash
rtk npx wrangler d1 execute twstock-gacha --local --command "SELECT prev_rarity, rarity, rarity_changed_on, direction, direction_changed_on FROM snapshot_stocks WHERE snapshot_date='2026-09-07' AND pool_id='POOL_ALL' AND stock_code='2409'"
```
Expected: `prev_rarity=R`、`rarity=SR`、`rarity_changed_on=2026-09-07`、`direction=UP`、`direction_changed_on` 為 **null**（方向沒翻，不該被寫上今天）

驗證完停掉 `npm run start`。

- [ ] **Step 7: Commit**

```bash
rtk git add lib/pool/generate.ts && rtk git commit -m "feat: 快照生成寫入變動標記

以 stock_code 取前一快照日的值算一次，17 個池共用。
欄位 11 → 14，upsert 批次隨 D1 綁定參數上限由 9 列降為 7 列。"
```

---

### Task 5: API 型別與抽卡回傳

**Files:**
- Modify: `lib/api/types.ts`（`DrawCard`）
- Modify: `lib/gacha/service.ts`（`DrawCard` 介面、`rows` 的 select、`cards` 的組裝）

**Interfaces:**
- Consumes: schema 三欄（Task 3）
- Produces: `DrawCard.prevRarity: "C" | "R" | "SR" | "SSR" | null`、`DrawCard.rarityChangedOn: string | null`、`DrawCard.directionChangedOn: string | null`

- [ ] **Step 1: 改共用型別**

`lib/api/types.ts` 的 `DrawCard`，在 `boardName` 那一行之後插入：

```ts
  // 變動標記（見 lib/pool/snapshot.ts）：null＝無紀錄，顯示端略過該段文字
  prevRarity: "C" | "R" | "SR" | "SSR" | null;
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
```

- [ ] **Step 2: 改 service 的介面**

`lib/gacha/service.ts` 的 `DrawCard` 介面，在 `boardName` 那一行之後插入：

```ts
  prevRarity: DrawResult["finalRarity"] | null; // 上一個不同的稀有度
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
```

- [ ] **Step 3: select 帶出三欄**

`lib/gacha/service.ts` 的 `const rows = await db.select({...})`，在 `change30d: snapshotStocks.change30d,` 之後插入：

```ts
      prevRarity: snapshotStocks.prevRarity,
      rarityChangedOn: snapshotStocks.rarityChangedOn,
      directionChangedOn: snapshotStocks.directionChangedOn,
```

- [ ] **Step 4: 組裝到卡片**

`lib/gacha/service.ts` 的 `const cards: DrawCard[] = results.map(...)`，在 `boardName: ...` 那一段之後、`jumpFrom` 之前插入：

```ts
      prevRarity: (row.prevRarity as DrawResult["finalRarity"] | null) ?? null,
      rarityChangedOn: row.rarityChangedOn,
      directionChangedOn: row.directionChangedOn,
```

- [ ] **Step 5: typecheck**

Run: `rtk npm run typecheck 2>&1 | grep -v "^\.next/"`
Expected: 沒有 `error TS` 行

- [ ] **Step 6: 驗證 API 真的回傳這三個 key**

啟動 dev server（`rtk npm run dev`），另開一個 shell：

Run:
```bash
rtk npx tsx -e "fetch('http://localhost:3001/api/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({poolId:'POOL_ALL',drawType:'single'})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.cards[0],null,1)))"
```
Expected: 輸出的物件含 `prevRarity`、`rarityChangedOn`、`directionChangedOn` 三個 key（本機只有一天快照，值為 `null` 是正確的）

- [ ] **Step 7: Commit**

```bash
rtk git add lib/api/types.ts lib/gacha/service.ts && rtk git commit -m "feat: 抽卡回傳變動標記三欄"
```

---

### Task 6: 卡片詳情顯示

**Files:**
- Modify: `components/cards/CardDetail.tsx`

**Interfaces:**
- Consumes: `rarityChangeMark`、`directionChangeMark`（Task 2）、`DrawCard` 三欄（Task 5）
- Produces: 卡片詳情的「稀有度」與「30 日漲跌」兩列會在有紀錄時前置變動文字

- [ ] **Step 1: 補 import**

`components/cards/CardDetail.tsx` 的 import 區塊加入：

```ts
import { directionChangeMark, rarityChangeMark } from "@/lib/cards/marks";
```

- [ ] **Step 2: 算出兩段文字**

找到 `const up = card.direction === "UP";` 與 `const rar = RARITY_COLOR[card.rarity];` 這兩行，在其後插入：

```ts
  // 變動標記：資料日當參考日決定要不要寫出年份。沒有紀錄時兩者皆為 null，
  // 該列就維持原本內容。
  const refDate = card.snapshotDate ?? null;
  const rarMark = rarityChangeMark(
    card.prevRarity,
    card.rarity,
    card.rarityChangedOn,
    refDate,
  );
  const dirMark = directionChangeMark(
    card.direction,
    card.directionChangedOn,
    refDate,
  );
```

- [ ] **Step 3: 改「30 日漲跌」列**

把 `rows` 陣列中的這一段：

```tsx
    {
      label: "30 日漲跌",
      value: (
        <span className="font-mono font-bold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
          {up ? "▲" : "▼"} {fmtPct(card.change30d)}
        </span>
      ),
    },
```

替換為：

```tsx
    {
      label: "30 日漲跌",
      value: (
        <>
          {dirMark && <span className="dim mr-2 text-xs">{dirMark}</span>}
          <span className="font-mono font-bold" style={{ color: up ? "var(--up)" : "var(--down)" }}>
            {up ? "▲" : "▼"} {fmtPct(card.change30d)}
          </span>
        </>
      ),
    },
```

- [ ] **Step 4: 改「稀有度」列**

把 `rows` 陣列中的這一段：

```tsx
    {
      label: "稀有度",
      value: (
        <span className="font-bold" style={{ color: rar }}>
          {card.rarity}　{RARITY_TIER_NAME[card.rarity]}
          {card.rolledRarity !== card.rarity && (
            <span className="dim ml-2 text-xs">（原始 {card.rolledRarity} 降級）</span>
          )}
        </span>
      ),
    },
```

替換為：

```tsx
    {
      label: "稀有度",
      value: (
        <>
          {rarMark && <span className="dim mr-2 text-xs">{rarMark}</span>}
          <span className="font-bold" style={{ color: rar }}>
            {card.rarity}　{RARITY_TIER_NAME[card.rarity]}
            {card.rolledRarity !== card.rarity && (
              <span className="dim ml-2 text-xs">（原始 {card.rolledRarity} 降級）</span>
            )}
          </span>
        </>
      ),
    },
```

- [ ] **Step 5: typecheck 與 lint**

Run: `rtk npm run typecheck 2>&1 | grep -v "^\.next/" ; rtk npx eslint components/cards/CardDetail.tsx lib/cards/marks.ts`
Expected: 兩者都沒有輸出

- [ ] **Step 6: 本機目視驗證**

Task 4 已在本機 D1 生成帶變動標記的 `2026-09-07` 快照（POOL_ALL 有 193 檔記了
稀有度變動、95 檔記了方向翻轉），直接用真資料驗，不需要手動塞值。

啟動 `rtk npm run dev`，開 `http://localhost:3001`。3003 健和興是已知兩項都變的
卡，但抽卡是隨機的——改用十連抽提高命中率，反覆抽到看見帶標記的卡為止。

Expected：
- 有稀有度變動的卡，「稀有度」列顯示如 `（09-07）自R卡降階　C　常規`
- 有方向翻轉的卡，「30 日漲跌」列顯示如 `（09-07）翻黑　▼ −4.97%`
- 沒有變動紀錄的卡，兩列維持原樣、沒有多餘文字
- 升階的卡顯示 `自C卡升階` 而非 `降階`

也順手開 `http://localhost:3001/history` 點開一張剛抽的卡，確認抽卡紀錄那條路徑
（`app/history/page.tsx` 把整個 `HistoryEntry` 當 `CardDetailData` 傳入）也顯示正常。

驗證完停掉 dev server。

- [ ] **Step 7: Commit**

```bash
rtk git add components/cards/CardDetail.tsx && rtk git commit -m "feat: 卡片詳情顯示稀有度與方向的變動標記

有紀錄才前置文字，沒有就維持原樣。"
```

---

### Task 7: 部署與正式環境驗證

**Files:**
- 無程式碼改動；只套 migration、重生快照、驗證線上

**Interfaces:**
- Consumes: Task 3 的 migration、Task 4 的生成邏輯
- Produces: 線上 `2026-09-07` 快照帶有變動標記；卡片詳情看得到文字

- [ ] **Step 1: 合併回 main**

```bash
rtk git checkout main && rtk git merge --no-ff feat/rarity-change-marks -m "feat: 卡片詳情顯示稀有度與方向變動標記"
```
Expected: merge 成功，無衝突

- [ ] **Step 2: 對正式 D1 套 migration**

Run: `rtk npx wrangler d1 execute twstock-gacha --remote --file ./drizzle/0002_snapshot-stocks-change-marks.sql --yes`
Expected: 三條 statement 成功

- [ ] **Step 3: 確認欄位存在**

Run: `rtk npx wrangler d1 execute twstock-gacha --remote --command "SELECT prev_rarity, rarity_changed_on, direction_changed_on FROM snapshot_stocks WHERE snapshot_date='2026-09-07' LIMIT 1"`
Expected: 回一列、三欄皆 null

- [ ] **Step 4: Push（觸發 Workers Builds 自動部署）**

```bash
rtk git push origin main
```
Expected: push 成功。Workers Builds 會由 push 事件觸發 `npm run build` → `npx wrangler deploy`，約 1 分鐘。

- [ ] **Step 5: 確認部署完成**

Run: `rtk npx wrangler deployments status`
Expected: `Created` 時間是剛才那一分鐘內的新版本

- [ ] **Step 6: 重生 09-07 快照**

正式庫已有 09-04 與 09-07 兩天快照，重生 09-07 時前一日取到 09-04，稀有度與方向可比。

Run: `rtk npm run snapshot -- --date 2026-09-07`
Expected: 印出 17 個池的摘要，無錯誤

- [ ] **Step 7: 驗證資料真的寫進去**

Run:
```bash
rtk npx wrangler d1 execute twstock-gacha --remote --command "SELECT COUNT(*) total, SUM(rarity_changed_on IS NOT NULL) rarity_marked, SUM(direction_changed_on IS NOT NULL) dir_marked FROM snapshot_stocks WHERE snapshot_date='2026-09-07' AND pool_id='POOL_ALL'"
```
Expected: `rarity_marked` 約 193、`dir_marked` 約 95（與 09-04 → 09-07 的實際變動數一致；因為重生時價格未變，數字應完全吻合）

再抽驗一檔已知的降階股票：
```bash
rtk npx wrangler d1 execute twstock-gacha --remote --command "SELECT stock_code, prev_rarity, rarity, rarity_changed_on FROM snapshot_stocks WHERE snapshot_date='2026-09-07' AND pool_id='POOL_ALL' AND stock_code='3003'"
```
Expected: `prev_rarity=R`、`rarity=C`、`rarity_changed_on=2026-09-07`（3003 健和興 09-04 是 R/UP、09-07 是 C/DOWN）

- [ ] **Step 8: 線上目視驗證**

開 `https://twstock-gacha.twstock-gacha.workers.dev`，抽卡並點開卡片詳情，找一張有變動紀錄的卡。
Expected：「稀有度」或「30 日漲跌」列出現 `（09-07）自R卡降階` ／ `（09-07）翻黑` 這類文字；沒有紀錄的卡兩列維持原樣。

- [ ] **Step 9: 刪掉已合併的分支**

```bash
rtk git branch -d feat/rarity-change-marks
```
Expected: 刪除成功
