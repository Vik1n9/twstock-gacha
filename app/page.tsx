import Link from "next/link";
import { getActivePools } from "@/lib/pool/query";
import { GachaStage } from "@/components/gacha/GachaStage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pools = await getActivePools();

  return (
    <div className="flex flex-col gap-6">
      <GachaStage pools={pools} />

      <div className="dim text-center text-xs">
        稀有度由個股近 30 個交易日漲跌幅決定（企劃書 1.2）　|　
        <Link href="/history" className="underline hover:text-[var(--ink)]">
          抽卡紀錄
        </Link>
        　|　
        <Link href="/pools" className="underline hover:text-[var(--ink)]">
          卡池列表
        </Link>
        　|　
        <Link href="/odds" className="underline hover:text-[var(--ink)]">
          機率說明
        </Link>
      </div>
    </div>
  );
}
