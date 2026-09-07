# 卡片詳情顯示稀有度變動

日期：2026-09-07
狀態：設計定案，待實作

## 目的

卡池的稀有度每天由收盤價自動重算，但玩家看不出來。點開卡片時，除了現在的稀有度，
也要看到「是哪一天、從哪一階變過來的」。

09-04 到 09-07 這一個交易日之間，全市場池 1076 檔裡有 193 檔稀有度改變。
這些變化目前完全沒有呈現。

## 語意

這欄追的是**稀有度的升降史**，與股價漲跌方向無關。

- 稀有度改變（C↔R↔SR↔SSR）才算一次變動。
- 稀有度不變、但 30 日漲跌由正轉負（漲卡變跌卡）**不算**變動，不更新日期。
  09-07 有 95 檔屬於這類，全部維持原本的變動紀錄。

## 資料

`snapshot_stocks` 新增兩欄，皆可為 null：

| 欄位 | 型別 | 內容 |
|---|---|---|
| `prev_rarity` | TEXT | 上一個不同的稀有度 |
| `rarity_changed_on` | TEXT | 變成現在這個稀有度的日期（YYYY-MM-DD） |

升階或降階不另外存，渲染時用 `RARITY_RANK` 比較 `prev_rarity` 與 `rarity` 現算。
存了就有兩份真相，改一邊忘另一邊就會不一致。

### 逐日沿用

每日 cron 生成快照時，對每一檔股票：

「上一個快照日」＝`pool_snapshots` 中小於今日的最大 `snapshot_date`，不是前一個日曆日。
連假或停市不會被誤判成一次變動。

```
prev = 上一個快照日該股的列
prev 不存在        → prev_rarity = null,       rarity_changed_on = null
prev.rarity 相同   → 兩欄都繼承 prev 的值（可能仍是 null）
prev.rarity 不同   → prev_rarity = prev.rarity, rarity_changed_on = 今日
```

每檔 O(1)，不需要載入額外的價格資料，因此不動 `PRICE_WINDOW_DAYS`，
也不會逼近 Worker isolate 的 128 MB 上限。

稀有度只由 `change30d` 決定、與卡池無關，所以 streak 以 `stock_code` 算一次，
17 個池寫入同一個值。否則同一檔股票在不同池可能顯示不同的變動日。

### 不回頭重算

這個機制只從上線起累積，不重建歷史。已知後果：上線初期多數卡片沒有變動紀錄，
顯示為「未知」。需要補齊過去約 12 個交易日的話，另開一次性腳本，不在本次範圍。

## 顯示

位置：卡片詳情既有的「稀有度」列，不新增列。

| 情況 | 顯示 |
|---|---|
| R 降到 C，09-07 | `（09-07）自R卡降階　C　常規` |
| C 升到 R，09-07 | `（09-07）自C卡升階　R　優良` |
| 未知／從未變動 | `C　常規` |
| 空池降級卡 | `（09-07）自R卡降階　C　常規（原始 R 降級）` |

日期格式：與該卡資料日同年寫 `09-07`，跨年寫完整 `2025-09-07`。
只寫月日的話，一檔一年多沒變動的股票會分不出是哪一年。

### 已知用詞衝突

「降階」（本次新增，稀有度隨行情下降）與既有的「原始 R 降級」
（空池時抽到的稀有度往下遞補，見企劃書 10.2）是兩件不同的事，
中文都帶「降」。兩者同時出現的機率低，本次保留現狀，不改既有文案。

## 改動範圍

| 檔案 | 改動 |
|---|---|
| `drizzle/0002_snapshot-stocks-rarity-change.sql` | 兩個 `ALTER TABLE ADD COLUMN` |
| `lib/db/schema.ts` | 欄位定義 |
| `lib/pool/snapshot.ts` | 新純函式 `resolveRarityChange(prev, currentRarity, date)` |
| `lib/pool/generate.ts` | 讀前一快照日、寫新欄位、upsert `set` 補兩欄、批次大小 9 → 7 |
| `lib/api/types.ts` | `DrawCard` 加 `prevRarity` / `rarityChangedOn` |
| `lib/gacha/service.ts` | select 帶出兩欄 |
| `components/cards/CardDetail.tsx` | 稀有度列 |
| `lib/pool/snapshot.test.ts` | 純函式分支測試 |

### 批次大小

`generate.ts` 的 upsert 批次是照 D1「單查詢上限 100 個綁定參數」算的：
目前 11 欄 → 每批 9 列。加兩欄變 13 欄，每批要降到 7 列，否則超限。

### 相容性

抽卡紀錄存在 localStorage，舊紀錄沒有這兩個欄位，讀出來是 `undefined`，
走「未知」分支顯示 `C　常規`，不會壞。

## 測試

`resolveRarityChange` 是純函式，用現成的 vitest（node 環境、`lib/**`）測四個分支：
無前一日、稀有度相同且前值為 null、稀有度相同且前值有日期、稀有度不同。
不需要新增測試框架或 jsdom。

## 上線後

1. 對 `--remote` 套用 migration。
2. 手動跑一次 `npm run snapshot`（冪等）重生 09-07 快照。
   前一日 09-04 有稀有度可比，193 檔稀有度變動的股票立刻拿到變動日，
   不必等下一個交易日。
