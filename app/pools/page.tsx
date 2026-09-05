import Link from "next/link";
import { getActivePools } from "@/lib/pool/query";
import { fmtPct } from "@/components/cards/StockCard";

export const dynamic = "force-dynamic";

// 企劃書 12.2 卡池頁（板塊行情牆）；12.3 篩選器 beta 隨多池開放
export default async function PoolsPage() {
  const pools = await getActivePools();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-black">卡池列表</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {pools.map((p) => {
          const theme = p.board?.theme;
          const snap = p.snapshot;
          const rc = p.rarityCounts ?? {};
          const open = !!snap?.isOpen;
          return (
            <div
              key={p.poolId}
              className="panel relative overflow-hidden p-5"
              style={{
                borderColor: theme ? `${theme.primary}55` : undefined,
                background: theme
                  ? `linear-gradient(150deg, color-mix(in srgb, ${theme.primary} 8%, var(--panel)), var(--panel))`
                  : undefined,
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-black" style={{ color: theme?.primary }}>
                    {p.board?.tagName ?? p.poolName}
                  </div>
                  <div className="dim text-xs">
                    {p.poolCode}　{p.board?.description}
                  </div>
                </div>
                <span
                  className="rounded px-2 py-0.5 text-xs font-bold"
                  style={{
                    color: open ? "var(--up)" : "var(--ink-dim)",
                    border: `1px solid ${open ? "var(--up)" : "var(--line)"}`,
                  }}
                >
                  {open ? "開放" : (snap?.reason ?? "今日未開放")}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="可抽股票數" value={snap ? `${snap.stockCount}` : "-"} />
                <Stat
                  label="上漲 / 下跌卡"
                  value={snap ? `${snap.upStockCount} / ${snap.downStockCount}` : "-"}
                />
                <Stat label="昨日強度" value={fmtPct(snap?.board1dStrength)} mono />
                <Stat label="30日強度" value={fmtPct(snap?.board30dStrength)} mono />
              </div>

              {/* 稀有度分布（分方向） */}
              <div className="mt-4 space-y-1.5 text-xs">
                {(["UP", "DOWN"] as const).map((dir) => {
                  const b = rc[dir] ?? { C: 0, R: 0, SR: 0, SSR: 0 };
                  const total = b.C + b.R + b.SR + b.SSR || 1;
                  return (
                    <div key={dir} className="flex items-center gap-2">
                      <span
                        className="w-6 font-bold"
                        style={{ color: dir === "UP" ? "var(--up)" : "var(--down)" }}
                      >
                        {dir === "UP" ? "▲" : "▼"}
                      </span>
                      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[var(--panel-2)]">
                        {(
                          [
                            ["C", "#7f8ba0", b.C],
                            ["R", "#4f8bff", b.R],
                            ["SR", "#b06bff", b.SR],
                            ["SSR", "var(--gold)", b.SSR],
                          ] as const
                        ).map(([rar, color, n]) => (
                          <div
                            key={rar}
                            style={{
                              width: `${(n / total) * 100}%`,
                              background: color,
                              opacity: n > 0 ? 0.85 : 0.15,
                            }}
                          />
                        ))}
                      </div>
                      <span className="dim w-40 text-right font-mono">
                        C{b.C} R{b.R} SR{b.SR} SSR{b.SSR}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 text-right">
                <Link
                  href="/"
                  className="inline-block rounded-lg border-2 px-4 py-1.5 text-sm font-bold transition hover:brightness-125"
                  style={{ borderColor: theme?.primary, color: theme?.primary }}
                >
                  進入卡池
                </Link>
              </div>

              {snap && (
                <div className="dim mt-2 text-right text-[10px]">
                  資料日 {snap.snapshotDate}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="dim text-xs">{label}</div>
      <div className={`${mono ? "font-mono" : ""} font-bold`}>{value}</div>
    </div>
  );
}
