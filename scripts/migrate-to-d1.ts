import { loadEnv } from "../lib/db/env";
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

loadEnv();

// 將 Neon Postgres 資料完整搬移到 D1：讀取各表 → 產生 INSERT SQL 檔
// → 以 wrangler d1 execute --file 套用（--local 或 --remote）。
// 用法：npm run migrate:dump
// 套用：npx wrangler d1 execute twstock-gacha --remote --file drizzle/d1-migration.sql
//       npx wrangler d1 execute twstock-gacha --local --file drizzle/d1-migration.sql

// D1 timestamp_ms 欄位存 epoch 毫秒（drizzle mode: "timestamp_ms"）
function ts(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return date.getTime();
}

function lit(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return String(Math.floor(value.getTime()));
  if (typeof value === "bigint") return String(value);
  const s = String(value).replace(/'/g, "''");
  return `'${s}'`;
}

function insertMulti(
  table: string,
  columns: string[],
  rows: unknown[][],
  out: string[],
): void {
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const values = rows
      .slice(i, i + CHUNK)
      .map((r) => `(${r.map(lit).join(", ")})`)
      .join(",\n  ");
    out.push(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values}\nON CONFLICT DO NOTHING;`,
    );
  }
}

interface TableSpec {
  table: string;
  // SQL 欄位名 → 讀取自 Postgres 的值
  select: string;
  columns: string[];
  row: (r: Record<string, unknown>) => unknown[];
}

const SPECS: TableSpec[] = [
  {
    table: "boards",
    select: "tag_id, tag_name, description, theme_color, active, sort_order",
    columns: ["tag_id", "tag_name", "description", "theme_color", "active", "sort_order"],
    row: (r) => [r.tag_id, r.tag_name, r.description, r.theme_color, r.active, r.sort_order],
  },
  {
    table: "pools",
    select:
      "pool_id, pool_code, pool_name, pool_type, related_tag_id, active, min_stock_count, sort_order",
    columns: [
      "pool_id", "pool_code", "pool_name", "pool_type",
      "related_tag_id", "active", "min_stock_count", "sort_order",
    ],
    row: (r) => [
      r.pool_id, r.pool_code, r.pool_name, r.pool_type,
      r.related_tag_id, r.active, r.min_stock_count, r.sort_order,
    ],
  },
  {
    table: "stocks",
    select:
      "stock_code, name, market, board_code, listed_date, active, updated_at",
    columns: ["stock_code", "name", "market", "board_code", "listed_date", "active", "updated_at"],
    row: (r) => [
      r.stock_code, r.name, r.market, r.board_code,
      r.listed_date, r.active, ts(r.updated_at),
    ],
  },
  {
    table: "stock_boards",
    select: "stock_code, tag_id, is_primary, updated_at",
    columns: ["stock_code", "tag_id", "is_primary", "updated_at"],
    row: (r) => [r.stock_code, r.tag_id, r.is_primary, ts(r.updated_at)],
  },
  {
    table: "stock_prices",
    select: "stock_code, date, close, change1d, volume",
    columns: ["stock_code", "date", "close", "change1d", "volume"],
    row: (r) => [r.stock_code, r.date, r.close, r.change1d, r.volume],
  },
  {
    table: "pool_snapshots",
    select:
      "id, snapshot_date, pool_id, stock_count, up_stock_count, down_stock_count, board_1d_strength, board_30d_strength, is_open, reason, created_at",
    columns: [
      "id", "snapshot_date", "pool_id", "stock_count", "up_stock_count",
      "down_stock_count", "board_1d_strength", "board_30d_strength",
      "is_open", "reason", "created_at",
    ],
    row: (r) => [
      r.id, r.snapshot_date, r.pool_id, r.stock_count, r.up_stock_count,
      r.down_stock_count, r.board_1d_strength, r.board_30d_strength,
      r.is_open, r.reason, ts(r.created_at),
    ],
  },
  {
    table: "snapshot_stocks",
    select:
      "id, snapshot_date, pool_id, stock_code, direction, rarity, change_30d, change_1d, close, weight, drawable",
    columns: [
      "id", "snapshot_date", "pool_id", "stock_code", "direction",
      "rarity", "change_30d", "change_1d", "close", "weight", "drawable",
    ],
    row: (r) => [
      r.id, r.snapshot_date, r.pool_id, r.stock_code, r.direction,
      r.rarity, r.change_30d, r.change_1d, r.close, r.weight, r.drawable,
    ],
  },
  {
    table: "draw_records",
    select:
      "id, drawn_at, pool_id, snapshot_date, draw_type, stock_code, direction, rolled_rarity, final_rarity",
    columns: [
      "id", "drawn_at", "pool_id", "snapshot_date", "draw_type",
      "stock_code", "direction", "rolled_rarity", "final_rarity",
    ],
    row: (r) => [
      r.id, ts(r.drawn_at), r.pool_id, r.snapshot_date, r.draw_type,
      r.stock_code, r.direction, r.rolled_rarity, r.final_rarity,
    ],
  },
  {
    table: "configs",
    select: "key, value, updated_at",
    columns: ["key", "value", "updated_at"],
    row: (r) => [r.key, r.value, ts(r.updated_at)],
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL（Neon 來源），請設定 .env.local");

  const sql = postgres(url, { max: 1, idle_timeout: 20 });
  const out: string[] = [
    "-- Neon → D1 資料遷移（由 scripts/migrate-to-d1.ts 產生）",
    `-- 產生時間：${new Date().toISOString()}`,
    // 註：D1 不接受顯式 BEGIN/COMMIT；各 statement 自帶隱式交易，
    // 寫入順序已依 FK 依賴排列
  ];
  const counts: string[] = [];

  try {
    for (const spec of SPECS) {
      // select/table 皆來自本檔 SPECS 常數，無注入風險
      const rows = (await sql.unsafe(
        `SELECT ${spec.select} FROM "${spec.table}"`,
      )) as Record<string, unknown>[];
      insertMulti(spec.table, spec.columns, rows.map(spec.row), out);
      counts.push(`${spec.table}: ${rows.length} 列`);
      console.log(`${spec.table} → ${rows.length} 列`);
    }
  } finally {
    await sql.end().catch(() => {});
  }

  const file = "drizzle/d1-migration.sql";
  writeFileSync(file, out.join("\n"));
  console.log(`\n已產生 ${file}`);
  console.log(counts.join("\n"));
  console.log(
    `\n套用：npx wrangler d1 execute twstock-gacha --remote --file ${file}\n` +
    `本機：npx wrangler d1 execute twstock-gacha --local --file ${file}`,
  );
}

// 確認遷移檔存在與否的提示（避免覆蓋）
if (process.argv.includes("--check")) {
  try {
    const content = readFileSync("drizzle/d1-migration.sql", "utf8");
    console.log(`已有遷移檔，${(content.length / 1024 / 1024).toFixed(1)} MB`);
  } catch {
    console.log("尚無遷移檔");
  }
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
