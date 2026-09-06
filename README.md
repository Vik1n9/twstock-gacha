# 台股抽卡所

以真實台股行情驅動的抽卡網頁遊戲。卡片稀有度由個股**近 30 個交易日漲跌幅**決定，並實作板塊卡池系統（企劃書 v1.1，見 `docs/`）。

**Beta 版範圍**：16 板塊池＋全市場池全數上線（上市普通股 1,084 檔）；板塊分類採「TWSE 產業別＋主題合併」（企劃書 3.1），AI 池為人工策展主題池；首頁卡池切換器；全市場池方向機率固定 50/50。精選池、還原股價為後續項目。

## 技術

> 本分支（`cloudflare-d1`）已將執行環境遷移至 Cloudflare Workers + D1（以 [vinext](https://github.com/cloudflare/vinext) 於 Vite 上重實作 Next.js 16 API），與 main 分支（Vercel + Neon）並行驗證中。

- Next.js 16.3 API（App Router）經 vinext + Vite 8 建置，部署 Cloudflare Workers
- Cloudflare D1（SQLite）+ Drizzle ORM（`drizzle-orm/sqlite-core`、D1 綁定／D1 HTTP API 雙模式）
- Cloudflare Cron Triggers（平日 10:00 UTC 快照）＋ KV cache adapter（`unstable_cache`/`revalidateTag`）
- GSAP + Canvas 粒子引擎（板塊主題 config 驅動）
- 資料源：TWSE MI_INDEX（全市場日收盤）、TWSE OpenAPI t187ap03_L（上市清單/產業別）

## 卡池列表（beta）

| 卡池 | 涵蓋（TWSE 產業別） | 檔數 |
|---|---|---:|
| 全市場池 | 所有上市普通股（排除 TDR），方向固定 50/50 | ~1,080 |
| 半導體池 | 24 半導體 | 96 |
| AI 與運算池 | 人工策展（伺服器/散熱電源/ASIC/交換器/雲端，`lib/sectors/ai-curate.ts`） | 46 |
| 電子製造池 | 31 其他電子＋05 電機機械 | 96 |
| 電腦與週邊池 | 25 電腦週邊＋29 電子通路 | 86 |
| 通信網路池 | 27 通信網路 | 46 |
| 光電光學池 | 26 光電 | 68 |
| 電子零組件池 | 28 電子零組件＋06 電器電纜 | 120 |
| 車電與汽車池 | 12 汽車＋11 橡膠（輪胎） | 55 |
| 金融保險池 | 17 金融保險 | 31 |
| 鋼鐵原物料池 | 10 鋼鐵＋01 水泥＋08 玻璃陶瓷＋09 造紙 | 50 |
| 塑膠化學池 | 21 化學＋03 塑膠 | 49 |
| 消費傳產池 | 02 食品＋04 紡織＋18 貿易百貨＋38 居家生活 | 95 |
| 生技醫療池 | 22 生技醫療 | 61 |
| 航運物流池 | 15 航運 | 28 |
| 觀光休閒池 | 16 觀光餐旅＋37 運動休閒 | 37 |
| 能源綠能池 | 35 綠能環保＋23 油電燃氣 | 35 |

建材營造（55）、其他業（52）不屬任何板塊池，僅進全市場池。股票可跨池（如台積電＝半導體＋AI）。

## 遊戲規則（摘要）

| 項目 | 規則 |
|---|---|
| 稀有度 | 30 日漲跌幅：0~<5% C、5~<15% R、15~<30% SR、≥30% SSR；下跌取絕對值同門檻 |
| 方向機率 | 板塊池依當日池內實際漲跌分布動態計算；全市場池固定 50/50 |
| 稀有度機率 | 方向內目標 C 80% / R 15% / SR 4% / SSR 1%；逐抽獨立（同張卡可重複抽出） |
| 跳變演出 | 純展示：抽中 SR 有 1/10 以「R 蓄力→跳升 SR」演出（全體約 0.4%）、SSR 有 1/10 以「SR 蓄力→跳升 SSR」（約 0.1%）；不改機率、不入抽卡紀錄 |
| 開放政策 | 所有卡池常態開放、無活動週期鎖池；單方向池照常開放（企劃書 5.4 方案B），方向機率即反映實際分布 |
| 空池 | 維持原方向，稀有度逐級下降；C 仍無貨視為資料異常 |

## 本機開發（cloudflare-d1 分支）

```bash
npm install
npx wrangler login             # Cloudflare 授權（wrangler 操作需要）
cp .env.example .env.local     # 填入 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID 等
npm run db:generate            # schema 異動時產生 migration SQL（drizzle-kit generate）
npx wrangler d1 execute twstock-gacha --local --file ./drizzle/0000_init-d1.sql --yes  # 本機 D1 建表
npm run seed                   # 16 板塊 + 全市場池 + 上市普通股 + 板塊映射（經 D1 HTTP API）
npm run backfill               # 回填 60 日曆天收盤價 + 計算漲跌幅
npm run snapshot               # 生成最新交易日快照（可 --date YYYY-MM-DD）
npm run dev:vinext             # http://localhost:3001（Vite dev）
npm run start:vinext           # 以 wrangler dev 跑建置後的 Worker（本機 D1，port 8787）
npm test                       # 單元測試（稀有度/快照/抽卡引擎）
npx tsx scripts/verify-odds.ts [-- --pool POOL_AI]  # 對真實快照模擬 30 萬抽驗機率
```

> seed/backfill/snapshot 走 D1 HTTP API，需要 `.env.local` 內的
> `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`
> （token 於 [dash → API Tokens](https://dash.cloudflare.com/profile/api-tokens) 建立，需 D1 Edit 權限）。

## 部署（Cloudflare Workers + D1）

```bash
npm run build:vinext     # Vite 多環境建置（client + RSC + SSR）
npm run deploy:vinext    # 部署到 Cloudflare Workers（含 cron trigger）
```

1. 建資源：`npx wrangler d1 create twstock-gacha`、`npx wrangler kv namespace create VINEXT_KV_CACHE`，
   將 id 填入 `wrangler.jsonc`。
2. 建表：`npx wrangler d1 execute twstock-gacha --remote --file ./drizzle/0000_init-d1.sql --yes`。
3. 資料：既有 Postgres 資料可用 `npm run migrate:dump` 產生 `drizzle/d1-migration.sql`，
   再以 `npx wrangler d1 execute twstock-gacha --remote --file drizzle/d1-migration.sql --yes` 匯入。
4. 密鑰：`npx wrangler secret put CRON_SECRET`。
5. Cron：`wrangler.jsonc` `triggers.crons`＝`0 10 * * 1-5`（平日台北 18:00，與原 Vercel 排程相同）。
   手動觸發：`curl -H "Authorization: Bearer $CRON_SECRET" https://<worker>.workers.dev/api/cron/snapshot`。

## 部署（Vercel + Neon，main 分支）

1. [Neon](https://neon.tech) 建專案，取得 pooled connection string。
2. Vercel 匯入本 repo，設定環境變數：
   - `DATABASE_URL`＝Neon 連線字串（含 `?sslmode=require`）
   - `CRON_SECRET`＝自訂密鑰（Vercel Cron 會自動以 Bearer 送出）
3. `npx drizzle-kit push`（本機 `.env.local` 改指向 Neon 後執行）→ `npm run seed` → `npm run backfill`。
4. 部署後手動觸發一次快照：
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/snapshot`
5. Cron：平日 10:00 UTC（台北 18:00）自動抓收盤並生成快照（`vercel.json`）。

## API

| 路由 | 說明 |
|---|---|
| `GET /api/pools` | 卡池清單＋最新快照 |
| `POST /api/draw` | `{poolId, drawType: single\|ten}` 抽卡 |
| `GET /api/cron/snapshot` | Bearer `CRON_SECRET`；抓收盤＋生成快照（冪等） |

## 資料載入分層

前台不會在開啟網頁時就把所有資料撈進來，而是分三段：

| 階段 | 觸發時機 | 載入內容 | DB 查詢數 |
|---|---|---:|---:|
| 1 | 開啟首頁 `/` | 卡池清單＋各池最新快照摘要（`getActivePools`） | 3 |
| 2 | 進 `/pools`、`/odds`、`/api/pools` | 再加上各池方向×稀有度張數（`getActivePoolsWithRarity`） | 4 |
| 3 | 按下單抽／十連 | 該池當日可抽個股明細（`POST /api/draw`） | 5～6 |

卡池資料每個交易日只在 cron 快照後變動一次，故 1、2 以 `unstable_cache`
（tag `pools`）快取；`/api/cron/snapshot` 生成新快照後會 `revalidateTag` 失效。

## 已知限制（beta）

- 漲跌幅使用**原始收盤價**：個股除權息日會被視為下跌（後續可改用還原股價，FinMind `TaiwanStockPriceAdj`）。
- 興櫃、上櫃、ETF、權證、TDR 未納入；僅上市普通股（部分知名 AI 概念股如群聯/信驊/雙鴻屬上櫃，故不在池內）。
- 板塊共振：板塊池以「同方向」計數；全市場池卡為混合板塊，已改回企劃書 15.3「同板塊 5+/8+」規則。
- 特效分派點（每池不同背景母題、十連排列、SSR 簽名）仍吃 SEMI 預設行為，僅主題色隨池切換（見 `docs/卡片與卡池擴充規範.md` §5）。
- TWSE 速率未公開規範，回填已節流（400ms/請求）；過度頻繁可能被暫時擋下。
- 抽卡紀錄（`/history`）存在瀏覽器 localStorage，換裝置或清除瀏覽資料就會消失；
  導入帳號後的遷移路徑見 `docs/卡片與卡池擴充規範.md` §8。

## 授權

[MIT](LICENSE) © 2026 Vik1n9
