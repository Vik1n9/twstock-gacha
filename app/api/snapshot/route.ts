import { NextResponse } from "next/server";
import { getSnapshotChanges } from "@/lib/pool/query";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/snapshot[?date=YYYY-MM-DD]
// 唯讀：該快照日「當天變動」的卡片清單（升降階、翻黑／轉白）＋全市場池摘要。
// date 省略＝最新快照日。查無該日快照回 404。
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (date !== null && !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date 格式須為 YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const changes = await getSnapshotChanges(date);
  if (!changes) {
    return NextResponse.json({ error: "找不到該日快照" }, { status: 404 });
  }

  return NextResponse.json(changes);
}
