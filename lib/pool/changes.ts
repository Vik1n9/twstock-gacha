import { RARITY_RANK, type Rarity } from "../fx/core";
import type { SnapshotChangeCard } from "../api/types";

// 某個快照日「當天發生變動」的卡片清單。純資料整形，不碰 DB，故可在 node 環境測試。
// 資料來源是 snapshot_stocks 的 prev_rarity / rarity_changed_on /
// direction_changed_on（寫入邏輯見 lib/pool/snapshot.ts 的 resolveChangeMarks）。
// 顯示文字不在這裡組，交給 lib/cards/marks.ts；這裡只回結構化欄位。

export interface ChangeRow {
  stockCode: string;
  stockName: string;
  boardCode: string | null;
  direction: string;
  rarity: string;
  prevRarity: string | null;
  close: number;
  change1d: number | null;
  change30d: number;
  rarityChangedOn: string | null;
  directionChangedOn: string | null;
}

// 排序：漲跌幅絕對值大的在前（同幅度以代號穩定排序），讓清單開頭就是當天最劇烈的變動。
export function toChangeCards(
  rows: ChangeRow[],
  boardNames: Map<string, string>,
  snapshotDate: string,
): SnapshotChangeCard[] {
  return rows
    .filter(
      (r) =>
        r.rarityChangedOn === snapshotDate ||
        r.directionChangedOn === snapshotDate,
    )
    .map((r) => {
      const rarity = r.rarity as Rarity;
      const prevRarity = r.prevRarity as Rarity | null;
      const rarityChanged = r.rarityChangedOn === snapshotDate;
      return {
        stockCode: r.stockCode,
        stockName: r.stockName,
        boardName: r.boardCode ? (boardNames.get(r.boardCode) ?? null) : null,
        direction: r.direction as "UP" | "DOWN",
        rarity,
        prevRarity,
        close: r.close,
        change1d: r.change1d,
        change30d: r.change30d,
        rarityChanged,
        // prevRarity 為 null＝這一檔在有變動標記欄位之前就已是現在的稀有度，
        // 判不出升降（見 resolveChangeMarks），所以 move 也給 null。
        rarityMove:
          rarityChanged && prevRarity
            ? RARITY_RANK[rarity] > RARITY_RANK[prevRarity]
              ? "up"
              : "down"
            : null,
        directionChanged: r.directionChangedOn === snapshotDate,
      } satisfies SnapshotChangeCard;
    })
    .sort(
      (a, b) =>
        Math.abs(b.change30d) - Math.abs(a.change30d) ||
        a.stockCode.localeCompare(b.stockCode),
    );
}
