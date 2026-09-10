# 台股抽卡所

**線上版**：https://twstock-gacha.voriens.dev  
（舊網址仍有效：https://twstock-gacha.twstock-gacha.workers.dev）

用真實台股行情驅動的抽卡遊戲：稀有度看個股**近 30 個日曆日漲跌幅**，卡池按板塊切。

> Beta：16 板塊池＋全市場池＋台灣50池已上線（上市普通股約 1,084 檔）。還原股價還沒做。

## 這是什麼

| 項目 | 規則（摘要） |
|---|---|
| 稀有度 | 近 30 個**日曆日**漲跌幅絕對值：`<5%` C、`<15%` R、`<30%` SR、`≥30%` SSR |
| 方向 | 板塊池依當日池內漲跌分布；全市場池固定 50/50 |
| 機率 | 方向內目標 C 80% / R 15% / SR 4% / SSR 1%；逐抽獨立 |
| 昇格演出 | 純展示（不改機率）：SR／SSR 各有約 1/10 會先演低一階再跳變 |
| 開放 | 全池常態開放；空池則同方向稀有度降級 |
| 變動標記 | 卡片詳情標出稀有度升降與漲跌翻轉的日期，如「（09-07）自R卡降階」「（09-07）翻黑」 |

站內「變動」頁（`/changes`）用卡片牆列出當日所有升階／降階／翻黑／轉白的個股，可依變動類型與稀有度篩選。

卡池一覽與產業對照見站內「卡池列表」。板塊分類採 TWSE 產業別＋主題合併；AI 池與台灣50池（參考 0050 成分）為人工策展。

## 技術棧

- **執行環境**：[vinext](https://github.com/cloudflare/vinext)（Vite 上的 Next.js 16 API）→ **Cloudflare Workers**
- **資料**：Cloudflare **D1** + Drizzle；平日 cron `0 10 * * 1-5`（台北 18:00）抓收盤並產快照
- **快取**：KV（`unstable_cache` / `revalidateTag`）
- **前端演出**：GSAP + Canvas
- **資料源**：TWSE MI_INDEX、TWSE OpenAPI `t187ap03_L`

舊版 Vercel + Neon 僅留在 `archive/vercel-neon`，不再維護。

## 本機開發

```bash
npm install
npx wrangler login             # Cloudflare 授權（wrangler 操作需要）
cp .env.example .env.local     # 填入 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID 等
npm run db:generate            # schema 異動時產生 migration SQL（drizzle-kit generate）
npx wrangler d1 execute twstock-gacha --local --file ./drizzle/0000_init-d1.sql --yes  # 本機 D1 建表
npx wrangler d1 execute twstock-gacha --local --file ./drizzle/0001_pool-snapshots-pool-idx.sql --yes
npx wrangler d1 execute twstock-gacha --local --file ./drizzle/0002_snapshot-stocks-change-marks.sql --yes
npm run seed                   # 16 板塊 + 全市場池 + 台灣50池 + 上市普通股 + 板塊映射（經 D1 HTTP API）
npm run backfill               # 回填 60 日曆天收盤價（結束後統一算一次 change1d）
npm run recompute              # 手動重算 change1d（校正用，可 --from / --to）
npm run snapshot               # 生成最新交易日快照（可 --date YYYY-MM-DD）
npm run dev                    # http://localhost:3001（vinext dev）
npm run build                  # Vite 多環境建置（client + RSC + SSR）
npm run start                  # 以 wrangler dev 跑建置後的 Worker（本機 D1，port 8787）
npm run cf-typegen             # wrangler.jsonc 改動後重新產生 worker-configuration.d.ts
npm test                       # 單元測試（稀有度/快照/抽卡引擎）
npx tsx scripts/verify-odds.ts [-- --pool POOL_AI]  # 對真實快照模擬 30 萬抽驗機率
```

> seed/backfill/snapshot 走 D1 HTTP API，需要 `.env.local` 內的
> `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`
> （token 於 [dash → API Tokens](https://dash.cloudflare.com/profile/api-tokens) 建立，需 D1 Edit 權限）。

## 部署（Cloudflare Workers + D1）

```bash
npm run build            # Vite 多環境建置（client + RSC + SSR）
npm run deploy           # 部署到 Cloudflare Workers（含 cron trigger）
```

1. 建資源：`npx wrangler d1 create twstock-gacha`、`npx wrangler kv namespace create VINEXT_KV_CACHE`，
   將 id 填入 `wrangler.jsonc`。
2. 建表：`npx wrangler d1 execute twstock-gacha --remote --file ./drizzle/0000_init-d1.sql --yes`，
   接著依序套用 `drizzle/` 下編號較大的 migration（目前為 `0002_snapshot-stocks-change-marks.sql`）。
   schema 異動後以 `npm run db:generate` 產生新的 migration，部署前記得對 `--remote` 套用。
3. 資料：`npm run seed` + `npm run backfill`。
4. 密鑰：`npx wrangler secret put CRON_SECRET`。
5. Cron：`wrangler.jsonc` `triggers.crons`＝`0 10 * * 1-5`（平日台北 18:00）。
   手動觸發：`curl -H "Authorization: Bearer $CRON_SECRET" https://<worker>.workers.dev/api/cron/snapshot`。
   `observability` 已開啟，cron 失敗會留在 Workers Logs（`npx wrangler tail`）。

> Workers Builds 若接 Git：Install `npm ci`、Build `npm run build`、Deploy 建議用專案的 `npm run deploy -- --skip-build`（不要只用裸的 `npx wrangler deploy`，會少掉 triggers 那段）。

## API

| 路由 | 說明 |
|---|---|
| `GET /api/pools` | 卡池清單＋最新快照 |
| `POST /api/draw` | `{poolId, drawType: single\|ten}` 抽卡 |
| `GET /api/snapshot` | `?date=YYYY-MM-DD`（省略＝最新快照日）；當日變動卡片清單（升降階、翻黑／轉白） |
| `GET /api/cron/snapshot` | Bearer `CRON_SECRET`；抓收盤＋生成快照（冪等） |

## 已知限制（beta）

- 用**原始收盤價**算漲跌；除權息日會被當成大跌
- 只含**上市普通股**（上櫃／興櫃／ETF／權證／TDR 不在）
- 抽卡紀錄在瀏覽器 `localStorage`，換裝置會沒
- TWSE 回填有節流；打太兇可能被擋

## 深入細節

實作筆記（演出時序、D1 寫入額度、特效節流、資料載入分層）不塞進這份總覽，見：

- [docs/internals.md](docs/internals.md)

## 授權

[MIT](LICENSE) © 2026 Vik1n9
