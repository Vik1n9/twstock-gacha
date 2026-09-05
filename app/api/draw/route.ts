import { NextResponse } from "next/server";
import { draw } from "@/lib/gacha/service";

export const dynamic = "force-dynamic";

interface DrawBody {
  poolId?: string;
  drawType?: string;
}

// POST /api/draw { poolId, drawType: 'single' | 'ten' }
// 企劃書 10.1/10.4：未開放池不得抽卡；資料不足回錯誤提示
export async function POST(request: Request) {
  let body: DrawBody;
  try {
    body = (await request.json()) as DrawBody;
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const poolId = body.poolId?.trim();
  const drawType = body.drawType === "ten" ? "ten" : "single";
  if (!poolId) {
    return NextResponse.json({ error: "缺少 poolId" }, { status: 400 });
  }

  const result = await draw(poolId, drawType);

  if (!result.ok) {
    const map: Record<string, { msg: string; status: number }> = {
      POOL_NOT_FOUND: { msg: "找不到此卡池", status: 404 },
      NO_SNAPSHOT: {
        msg: "此板塊卡池目前資料不足，請選擇其他卡池。",
        status: 409,
      },
      POOL_NOT_OPEN: {
        msg: "此板塊卡池目前資料不足，請選擇其他卡池。",
        status: 409,
      },
      ANOMALY: {
        msg: "抽卡時發生資料異常，請稍後再試。",
        status: 500,
      },
    };
    const conf = map[result.error.code];
    return NextResponse.json(
      { error: conf.msg, code: result.error.code },
      { status: conf.status },
    );
  }

  return NextResponse.json(result.outcome);
}
