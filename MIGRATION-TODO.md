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

## 3. D1 索引 migration

**現況**：PR #9 已合併，但**遠端 D1 尚未套用**。不影響正確性，只影響查詢計畫
（抽卡取「某池最新開放快照」會從索引搜尋退回掃描，成本隨快照歷史線性成長）。

```bash
git pull origin main
npx wrangler d1 execute twstock-gacha --remote --yes \
  --file ./drizzle/0001_pool-snapshots-pool-idx.sql
```

不想拉檔案的話，內容只有一句：

```bash
npx wrangler d1 execute twstock-gacha --remote --yes \
  --command "CREATE INDEX \`pool_snapshots_pool_idx\` ON \`pool_snapshots\` (\`pool_id\`,\`snapshot_date\`);"
```

驗證（應出現 `SEARCH ... USING INDEX pool_snapshots_pool_idx (pool_id=?)`，而非 `SCAN`）：

```bash
npx wrangler d1 execute twstock-gacha --remote --yes \
  --command "EXPLAIN QUERY PLAN SELECT * FROM pool_snapshots WHERE pool_id='POOL_ALL' AND is_open=1 ORDER BY snapshot_date DESC LIMIT 1;"
```

---

## 4. GitHub repo 資訊

Repo 首頁 → About（右上角齒輪）：

- **Description**（目前仍寫 Neon）：
  - 現在：`台股抽卡所 — 以台股 30 日漲跌幅決定稀有度的板塊抽卡遊戲（Next.js + Drizzle + Neon）`
  - 改為：`台股抽卡所 — 以台股 30 日漲跌幅決定稀有度的板塊抽卡遊戲（Cloudflare Workers + D1 + Drizzle）`
- **Website**：`https://twstock-gacha.twstock-gacha.workers.dev`

---

## 5. 清理已合併分支

做完第 1 項後再刪 `cloudflare-d1`。

```bash
git push origin --delete cloudflare-d1
git push origin --delete claude/jump-animation-trigger-t5x4mc
git push origin --delete claude/mobile-overheating-issue-tfqwiv
git push origin --delete claude/webpage-load-performance-tj0i8z
git push origin --delete claude/cloudflare-deployment-check-2pokfj
```

以上五條都已完整併入 `main`（逐一以 `git merge-base --is-ancestor` 驗證過），刪除不會遺失任何 commit。

**`claude/happy-lamport-62xqyi` 例外**：它有一個 main 沒有的 commit `04cd9e9`
（Postgres 時代的「DB client 延遲連線」修正，含一個已不適用的 `lib/db/client.test.ts`）。
該修正後來被 main 的 `c28e73f` 取代，再被目前的 `getDb()` 取代，功能上已無價值。
確認後可一併刪除，但它不是單純的「已合併分支」。

**保留 `archive/vercel-neon`** — 那是 Vercel + Neon 版本的唯一存放處。

---

## 完成後

刪除本檔案：

```bash
git rm MIGRATION-TODO.md && git commit -m "chore: 移除遷移收尾備忘錄" && git push
```
