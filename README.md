# 台股抽卡所

以真實台股行情驅動的抽卡網頁遊戲。卡片稀有度由個股**近 30 個交易日漲跌幅**決定，並實作板塊卡池系統（企劃書 v1.1，見 `docs/`）。

**Alpha 版範圍**：上市半導體股（96 檔）＋半導體池（SEMI）單一板塊池；SEMI 完整版主題特效。其他 15 板塊、上櫃、全市場池、精選池為 Beta 項目（架構已預留）。

## 技術

- Next.js 16.3（App Router、Turbopack）+ TypeScript + Tailwind v4
- Neon Postgres（本機 dev 用 Docker Postgres）+ Drizzle ORM
- GSAP + Canvas 粒子引擎（板塊主題 config 驅動）
- 資料源：TWSE MI_INDEX（全市場日收盤）、TWSE OpenAPI t187ap03_L（上市清單/產業別）

## 遊戲規則（摘要）

| 項目 | 規則 |
|---|---|
| 稀有度 | 30 日漲跌幅：0~<5% C、5~<15% R、15~<30% SR、≥30% SSR；下跌取絕對值同門檻 |
| 方向機率 | 板塊池依當日池內實際漲跌分布動態計算（全市場池固定 50/50，Beta） |
| 稀有度機率 | 方向內目標 C 80% / R 15% / SR 4% / SSR 1% |
| 空池 | 維持原方向，稀有度逐級下降；C 仍無貨視為資料異常 |
| 開放門檻 | ≥30 檔可抽、漲跌各 ≥1 檔，未達隱藏並記原因 |

## 本機開發

```bash
npm install
docker compose up -d          # 本機 Postgres（port 54329）
cp .env.example .env.local    # 預設已指向本機 DB
npm run db:push               # 建表
npm run seed                  # 16 板塊定義 + 半導體股票清單（TWSE API）
npm run backfill              # 回填 60 日曆天收盤價 + 計算漲跌幅
npm run snapshot              # 生成最新交易日快照（可 --date YYYY-MM-DD）
npm run dev                   # http://localhost:3000
npm test                      # 單元測試（稀有度/快照/抽卡引擎）
npm run verify-odds           # 對真實快照模擬 10 萬抽驗機率
```

## 部署（Vercel + Neon）

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

## 已知限制（alpha）

- 漲跌幅使用**原始收盤價**：個股除權息日會被視為下跌（Beta 可改用還原股價，FinMind `TaiwanStockPriceAdj`）。
- 興櫃、上櫃、ETF、權證未納入；僅上市普通股。
- 板塊共振特效暫以「同方向」計數（板塊池內同板塊恆成立，Beta 全市場池改回企劃書 15.3 原規則）。
- TWSE 速率未公開規範，回填已節流（400ms/請求）；過度頻繁可能被暫時擋下。
- 抽卡紀錄（`/history`）存在瀏覽器 localStorage，換裝置或清除瀏覽資料就會消失；
  導入帳號後的遷移路徑見 `docs/卡片與卡池擴充規範.md` §8。

## 授權

[MIT](LICENSE) © 2026 Vik1n9
