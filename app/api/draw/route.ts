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

  let result: Awaited<ReturnType<typeof draw>>;
  try {
    result = await draw(poolId, drawType);
  } catch (err) {
    // 沒有這層 try/catch 的話，任何例外都會變成空 body 的 500，
    // 前端只看到「卡住」，日誌也只剩框架的一行包裝訊息。
    // cause 要分開印：D1／drizzle 的真正錯誤訊息藏在那裡。
    const cause = err instanceof Error ? err.cause : undefined;
    console.error("[api/draw]", err, "cause:", cause);
    return NextResponse.json(
      {
        error: "抽卡時發生錯誤，請稍後再試。",
        detail: err instanceof Error ? err.message : String(err),
        cause: cause instanceof Error ? cause.message : (cause ?? null),
      },
      { status: 500 },
    );
  }

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
