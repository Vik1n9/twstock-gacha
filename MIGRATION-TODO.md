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

## 1. Cloudflare Worker 的部署分支 ⚠️ 先做這項

**現況**：Git 整合仍追蹤 `cloudflare-d1`。若不改，**推送到 `main` 的更新不會自動部署**。

Dashboard → Workers & Pages → `twstock-gacha` → Settings → Build／Git 整合，
把追蹤分支由 `cloudflare-d1` 改為 `main`。

> 這項必須排在「刪除 `cloudflare-d1`」之前，否則整合會指向不存在的分支。

驗證：推一個 commit 到 `main`，確認觸發建置且 `x-vinext-build-id` 有變。

```bash
curl -sI https://twstock-gacha.twstock-gacha.workers.dev/ | grep -i x-vinext-build-id
```

---

## 2. Vercel 專案的 Git 連結

**現況**：Vercel 仍連著本 repo。`main` 已移除 `vercel.json`，預設會跑
`npm run build`（＝`vinext build`，產物 `dist/`），Vercel 期待 `.next`，**必定失敗**。

Dashboard → `twstock-gacha` → Settings → Git，二擇一：

- **Disconnect**（若不再需要 Vercel），或
- 把 Production Branch 改為 `archive/vercel-neon`
  （該分支的 `build` 仍是 `next build`，可正常部署，剛好作為庫存備份）

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

- `cloudflare-d1`：**先做完第 1 項**（Workers Git 整合改追蹤 `main`）再刪，否則整合指向不存在的分支
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
