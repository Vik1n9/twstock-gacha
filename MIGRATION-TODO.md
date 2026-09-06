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
| `main` | `7649e8f`（Cloudflare Workers + D1） |
| `archive/vercel-neon` | `c50d3ed`（遷移前的 Vercel + Neon，僅備份） |
| 線上站 | https://twstock-gacha.twstock-gacha.workers.dev |

---

## 1. ~~Cloudflare Worker 的部署分支~~ — ✅ 前提不成立，無需處理（2026-09-06）

Dashboard 實際顯示此 Worker **未繫結任何 Git 整合**（部署清單中的
"Unknown (deployment)" 皆為手動 `wrangler deploy`）。因此：

- 目前部署方式＝手動 `npm run deploy:vinext`，main 推送不會自動部署
- `cloudflare-d1` 已於 2026-09-06 刪除（已完整併入 main，無綁定依賴）
- 若要自動部署，可選：
  - **GitHub Actions**：push 到 main 時跑 `npm run deploy:vinext`（repo secret 放 `CLOUDFLARE_API_TOKEN`，需 Workers Scripts Edit 權限）
  - 或 Dashboard 手動接上 Workers Builds（Git 整合）

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
- `claude/happy-lamport-62xqyi`：有一個 main 沒有的 commit `04cd9e9`
  （Postgres 時代的「DB client 延遲連線」修正）。該問題已由現行 `getDb()`（D1 雙模式）
  以不同方式解決，功能上已無價值——確認後可刪
- `archive/vercel-neon`：**保留**，是 Vercel + Neon 版本的唯一存放處

---

## 完成後

刪除本檔案：

```bash
git rm MIGRATION-TODO.md && git commit -m "chore: 移除遷移收尾備忘錄" && git push
```
