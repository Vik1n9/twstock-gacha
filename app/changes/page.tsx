import { getSnapshotChanges } from "@/lib/pool/query";
import { ChangeBoard } from "@/components/changes/ChangeBoard";

export const dynamic = "force-dynamic";

// 當日變動頁：把 snapshot_stocks 的變動標記攤成卡片牆（資料同 GET /api/snapshot）。
// 呈現與 /history 一致：卡面格 + 稀有度篩選 + 點開放大檢視。
export default async function ChangesPage() {
  const data = await getSnapshotChanges(null);

  if (!data || data.cards.length === 0) {
    return (
      <div className="panel p-10 text-center">
        <div className="text-lg font-black">
          {data ? "今天沒有卡片變動" : "還沒有快照資料"}
        </div>
        <div className="dim mt-2 text-sm">
          {data
            ? `資料日 ${data.snapshotDate}：沒有任何一檔的稀有度或方向在今天改變。`
            : "等收盤後的每日快照生成，這裡就會有內容。"}
        </div>
      </div>
    );
  }

  return <ChangeBoard cards={data.cards} snapshotDate={data.snapshotDate} />;
}
