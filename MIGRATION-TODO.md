# 遷移收尾待辦

> **這是暫時性檔案，全部做完後請刪除。**
>
> 程式碼側的遷移（Vercel + Neon → Cloudflare Workers + D1）已完成並合併至 `main`
> （PR #7 / #8 / #9 / #10）。以下是**只能在各家 Dashboard 或以你的憑證執行**的收尾項目——
> 這些我無法代勞：session 內 `wrangler` 未認證、環境無任何 Cloudflare／Vercel 憑證，
> 且 git proxy 會擋下刪除遠端分支的操作。

目前狀態：

| 項目 | 值 |
|---|---|
| `main` | `6506e45`（Cloudflare Workers + D1） |
| `archive/vercel-neon` | `c50d3ed`（遷移前的 Vercel + Neon，僅備份） |
| 線上站 | https://twstock-gacha.twstock-gacha.workers.dev |

---

## 1. 部署自動化 — Workers Builds 的 production branch 改為 `main`（**唯一剩餘項目**）

**Git 整合是存在且運作中的**，只是它的 production branch 不是 `main`。

證據：

| 觀察 | 結果 |
|---|---|
| PR 分支推送 | Cloudflare 每次都建置成功並產生 Preview URL（例：`b3490aef` → build id `3ae50148`，頁面與抽卡皆 200） |
| 推 `6506e45`、`cdd5aff` 到 `main` | 線上 `x-vinext-build-id` 仍是 `d0fca2ea` **未變動** |

即：**預覽建置正常，但推 `main` 不會更新 production**。合理推斷 production branch
仍指向已刪除的 `cloudflare-d1`。

> 註：Cloudflare 的建置結果是以 **PR comment** 呈現，不是 commit status，
> 所以用 `commits/<sha>/status` 查會是空的——先前一度據此誤判為「沒有 Git 整合」。

**要做的事**：Workers & Pages → `twstock-gacha` → Settings → Builds，
把 **production branch 改為 `main`**。

由於預覽建置一直成功，**目前設定裡的 install／build／deploy 指令是有效的，不需要更動**。
下表僅供核對或重新輸入時參考。

### 指令對照表（已實測，僅供核對）

| 設定 | 值 |
|---|---|
| Repository / Branch | `Vik1n9/twstock-gacha` / `main` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy -- --skip-build` |

**⚠️ 不要用 `npm run build:vinext`** — 這個 script 已不存在。PR #7 將它更名為
`build`，PR #10 又移除了曾短暫存在的 `build:next`。目前 `main` 上只有：

```
dev    = vinext dev --port 3001
build  = vinext build
start  = wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state
deploy = vinext-cloudflare deploy --config dist/server/wrangler.json
```

**⚠️ 不要用 `npx wrangler deploy`** — `vinext-cloudflare deploy` 不只是包一層
wrangler，它會驗證 setup（App Router／Pages Router 偵測）、以 Vite 建置，
並以 `wrangler versions upload` → `versions deploy` → `triggers deploy` 分段部署。
直接用 `wrangler deploy` 會少掉 triggers deploy（cron 設定）那一段。
`--skip-build` 是它支援的旗標，用來沿用 Build 階段的 `dist/`，避免重複建置。

實測記錄（本機，2026-09-06）：

```
$ npm run build
  Build complete. Run `vinext start` to start the production server.

$ npm run deploy -- --skip-build --dry-run
  Project: twstock-gacha
  Router:  App Router
  ISR:     none
  Dry run complete. No build or deploy performed.
```

### 為何不能用 root 的 wrangler.jsonc

vinext 的 worker entry 依賴 Vite 虛擬模組（`virtual:vinext-worker-entry`），
直接對 root `wrangler.jsonc` 部署會無法解析。必須先建置，再以建置產生的
`dist/server/wrangler.json` 部署——上表的 Deploy command 已經是這個形式。

### 改完如何驗證

推一個 commit 到 `main`，確認線上 build id 從 `d0fca2ea` 變成別的值：

```bash
curl -sI https://twstock-gacha.twstock-gacha.workers.dev/ | grep -i x-vinext-build-id
```

---

## 2. ~~Vercel 專案的 Git 連結~~ — ✅ 已完成（2026-09-06）

已於 Dashboard 斷開 Vercel 連結。

---

## 3. ~~D1 索引 migration~~ — ✅ 已完成（2026-09-06）

`wrangler d1 execute --remote --file ./drizzle/0001_pool-snapshots-pool-idx.sql` 已套用，
`EXPLAIN QUERY PLAN` 驗證：

```
SEARCH pool_snapshots USING INDEX pool_snapshots_pool_idx (pool_id=?)
```

---

## ~~4. GitHub repo 資訊~~ — ✅ 已完成（2026-09-06）

已於 GitHub API 確認：

- Description：`台股抽卡所 — 以台股 30 日漲跌幅決定稀有度的板塊抽卡遊戲（Cloudflare Workers + D1 + Drizzle）`
- Homepage：`https://twstock-gacha.twstock-gacha.workers.dev`

---

## 5. 清理已合併分支 — 部分完成（2026-09-06）

已刪除（逐一以 `git merge-base --is-ancestor` 重新驗證過已併入 `main`）：

- ~~`claude/jump-animation-trigger-t5x4mc`~~
- ~~`claude/mobile-overheating-issue-tfqwiv`~~
- ~~`claude/webpage-load-performance-tj0i8z`~~
- ~~`claude/cloudflare-deployment-check-2pokfj`~~

**待處理**：

- ~~`cloudflare-d1`~~ 已刪除（2026-09-06，Git 整合確認不存在後無依賴）
- ~~`claude/happy-lamport-62xqyi`~~ 已刪除（2026-09-06；唯一 commit `04cd9e9`
  的功能已由 main 現行 `getDb()` 取代）
- `archive/vercel-neon`：**保留**，是 Vercel + Neon 版本的唯一存放處

**剩餘**：Dashboard 完成 Workers Builds 接線（見第 1 項）後，刪除本檔案。

---

## 完成後

刪除本檔案：

```bash
git rm MIGRATION-TODO.md && git commit -m "chore: 移除遷移收尾備忘錄" && git push
```
