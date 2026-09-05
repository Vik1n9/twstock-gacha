import { NextResponse } from "next/server";
import { getActivePools } from "@/lib/pool/query";

export const dynamic = "force-dynamic";

// GET /api/pools：開放卡池清單 + 各池最新快照
export async function GET() {
  const pools = await getActivePools();
  return NextResponse.json({ pools });
}
