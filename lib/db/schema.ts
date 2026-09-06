import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// D1（SQLite）版 schema：由 PostgreSQL 版（drizzle-orm/pg-core）遷移。
// 對應關係：serial → integer autoincrement、timestamp with timezone →
// integer timestamp_ms（$defaultFn 補 new Date()）、double precision → real、
// boolean → integer boolean mode。

const booleanCol = (name: string) => integer(name, { mode: "boolean" });

const timestampMs = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

// 企劃書 16.1 BoardTag
export const boards = sqliteTable("boards", {
  tagId: text("tag_id").primaryKey(), // 板塊標籤 ID，如 'SEMI'
  tagName: text("tag_name").notNull(),
  description: text("description").notNull().default(""),
  themeColor: text("theme_color").notNull().default("#888888"),
  active: booleanCol("active").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// 企劃書 16.3 CardPool
export const pools = sqliteTable("pools", {
  poolId: text("pool_id").primaryKey(), // 如 'POOL_SEMI'
  poolCode: text("pool_code").notNull(),
  poolName: text("pool_name").notNull(),
  poolType: text("pool_type").notNull(), // market | board | featured | event
  relatedTagId: text("related_tag_id").references(() => boards.tagId),
  active: booleanCol("active").notNull().default(false),
  minStockCount: integer("min_stock_count").notNull().default(30),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const stocks = sqliteTable(
  "stocks",
  {
    stockCode: text("stock_code").primaryKey(),
    name: text("name").notNull(),
    market: text("market").notNull(), // twse | tpex
    boardCode: text("board_code").references(() => boards.tagId), // 主板塊（顯示用；池成員以 stock_boards 為準）
    listedDate: text("listed_date"), // YYYY-MM-DD
    active: booleanCol("active").notNull().default(true),
    updatedAt: timestampMs("updated_at"),
  },
  (t) => [index("stocks_board_idx").on(t.boardCode, t.active)],
);

// 企劃書 16.2 StockBoardMapping：股票 ↔ 板塊多對多（主板塊 + 副板塊/策展標籤）
// 卡池成員資格的唯一真相來源；一檔股票可同時進多個板塊池（如台積電＝SEMI＋AI）
export const stockBoards = sqliteTable(
  "stock_boards",
  {
    stockCode: text("stock_code")
      .notNull()
      .references(() => stocks.stockCode),
    tagId: text("tag_id")
      .notNull()
      .references(() => boards.tagId),
    isPrimary: booleanCol("is_primary").notNull().default(true),
    updatedAt: timestampMs("updated_at"),
  },
  (t) => [
    uniqueIndex("stock_boards_pk").on(t.stockCode, t.tagId),
    index("stock_boards_tag_idx").on(t.tagId),
  ],
);

export const stockPrices = sqliteTable(
  "stock_prices",
  {
    stockCode: text("stock_code")
      .notNull()
      .references(() => stocks.stockCode),
    date: text("date").notNull(), // YYYY-MM-DD，避免時區問題
    close: real("close").notNull(),
    change1d: real("change1d"), // 昨日漲跌幅 %，收盤後計算
    volume: real("volume"),
  },
  (t) => [
    // 註：PK 由 unique index 承接
    uniqueIndex("stock_prices_pk").on(t.stockCode, t.date),
    index("stock_prices_date_idx").on(t.date),
  ],
);

// 企劃書 16.4 CardPoolSnapshot（id 自增，business key 為日期+池）
export const poolSnapshots = sqliteTable(
  "pool_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD，資料日（最近完整交易日）
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.poolId),
    stockCount: integer("stock_count").notNull().default(0),
    upStockCount: integer("up_stock_count").notNull().default(0),
    downStockCount: integer("down_stock_count").notNull().default(0),
    board1dStrength: real("board_1d_strength"), // 板塊昨日強度（中位數 %）
    board30dStrength: real("board_30d_strength"), // 板塊30日強度（中位數 %）
    isOpen: booleanCol("is_open").notNull().default(false),
    reason: text("reason"), // 未開放原因
    createdAt: timestampMs("created_at"),
  },
  (t) => [uniqueIndex("pool_snapshots_bk").on(t.snapshotDate, t.poolId)],
);

// 企劃書 16.5 CardPoolStockMapping
export const snapshotStocks = sqliteTable(
  "snapshot_stocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotDate: text("snapshot_date").notNull(),
    poolId: text("pool_id").notNull(),
    stockCode: text("stock_code").notNull(),
    direction: text("direction").notNull(), // UP | DOWN
    rarity: text("rarity").notNull(), // C | R | SR | SSR
    change30d: real("change_30d").notNull(), // 過去30日漲跌幅 %
    change1d: real("change_1d"),
    close: real("close").notNull(),
    weight: real("weight").notNull().default(1),
    drawable: booleanCol("drawable").notNull().default(true),
  },
  (t) => [
    uniqueIndex("snapshot_stocks_bk").on(
      t.snapshotDate,
      t.poolId,
      t.stockCode,
    ),
    index("snapshot_stocks_pool_idx").on(t.snapshotDate, t.poolId, t.direction, t.rarity),
  ],
);

// 抽卡紀錄（除錯/機率驗證用，alpha 無 UI）
export const drawRecords = sqliteTable("draw_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  drawnAt: timestampMs("drawn_at"),
  poolId: text("pool_id").notNull(),
  snapshotDate: text("snapshot_date").notNull(),
  drawType: text("draw_type").notNull(), // single | ten
  stockCode: text("stock_code").notNull(),
  direction: text("direction").notNull(),
  rolledRarity: text("rolled_rarity").notNull(), // 隨機抽中的稀有度（降級前）
  finalRarity: text("final_rarity").notNull(), // 空池降級後最終稀有度
});

// 企劃書 19 營運配置
export const configs = sqliteTable("configs", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestampMs("updated_at"),
});

export type Board = typeof boards.$inferSelect;
export type Pool = typeof pools.$inferSelect;
export type Stock = typeof stocks.$inferSelect;
export type StockBoard = typeof stockBoards.$inferSelect;
export type StockPrice = typeof stockPrices.$inferSelect;
export type PoolSnapshot = typeof poolSnapshots.$inferSelect;
export type SnapshotStock = typeof snapshotStocks.$inferSelect;
export type DrawRecord = typeof drawRecords.$inferSelect;
