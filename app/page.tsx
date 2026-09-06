import Link from "next/link";
import { getActivePools } from "@/lib/pool/query";
import { GachaStage } from "@/components/gacha/GachaStage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pools = await getActivePools();

  return (
    <div className="flex flex-col gap-6">
      <GachaStage pools={pools} />

      {/* 手機優先：改為可換行的 flex，連結加大點擊區 */}
      <div className="dim flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 text-center text-xs">
        {/* 免責聲明 */}
        <span className="basis-full">
          本遊戲僅供娛樂，不構成投資建議，亦不保證數字正確，投資理財請謹慎評估。
        </span>
        <span className="basis-full opacity-80">
          Produced by{" "}
          <a
            href="https://github.com/Vik1n9/twstock-gacha"
            target="_blank"
            rel="noopener noreferrer"
            className="py-1 underline hover:text-[var(--ink)]"
          >
            Vik1n9
          </a>{" "}
          · Released under the MIT License
        </span>
        <Link href="/history" className="py-1 underline hover:text-[var(--ink)]">
          抽卡紀錄
        </Link>
        <Link href="/pools" className="py-1 underline hover:text-[var(--ink)]">
          卡池列表
        </Link>
        <Link href="/odds" className="py-1 underline hover:text-[var(--ink)]">
          機率說明
        </Link>
      </div>
    </div>
  );
}
