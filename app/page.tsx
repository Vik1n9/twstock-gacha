import Link from "next/link";
import { getActivePools } from "@/lib/pool/query";
import { GachaStage } from "@/components/gacha/GachaStage";
import { fmtPct } from "@/components/cards/StockCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const pools = await getActivePools();
  const pool = pools.find((p) => p.snapshot?.isOpen) ?? pools[0];
  const theme = pool?.board?.theme;

  return (
    <div className="flex flex-col gap-6">
      {/* 板塊簡介條（企劃書 7.3 精選池顯示內容之 alpha 版） */}
      {pool && (
        <div
          className="panel relative overflow-hidden p-5"
          style={{
            borderColor: theme ? `${theme.primary}55` : undefined,
            background: theme
              ? `linear-gradient(120deg, color-mix(in srgb, ${theme.primary} 10%, var(--panel)), var(--panel))`
              : undefined,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="dim text-xs tracking-widest">每日板塊</div>
              <div className="text-lg font-black" style={{ color: theme?.primary }}>
                {pool.board?.tagName}　{pool.board?.tagName && "板塊"}
              </div>
              <div className="dim mt-0.5 text-xs">{pool.board?.description}</div>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <div className="dim text-xs">板塊昨日強度</div>
                <div className="font-mono font-bold">
                  {fmtPct(pool.snapshot?.board1dStrength)}
                </div>
              </div>
              <div>
                <div className="dim text-xs">板塊 30 日強度</div>
                <div className="font-mono font-bold">
                  {fmtPct(pool.snapshot?.board30dStrength)}
                </div>
              </div>
              <div>
                <div className="dim text-xs">可抽股票</div>
                <div className="font-mono font-bold">{pool.snapshot?.stockCount ?? "-"}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <GachaStage pools={pools} />

      <div className="dim text-center text-xs">
        稀有度由個股近 30 個交易日漲跌幅決定（企劃書 1.2）　|　
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
