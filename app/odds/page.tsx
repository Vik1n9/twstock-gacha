import { getActivePoolsWithRarity } from "@/lib/pool/query";

export const dynamic = "force-dynamic";

// 企劃書 18 機率揭露頁（alpha：僅板塊池；全市場池與精選池 beta 開放）
export default async function OddsPage() {
  const pools = await getActivePoolsWithRarity();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-black">機率說明</h1>
      <p className="dim text-sm">最後更新：隨每日快照更新當日分布</p>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">方向機率</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>全市場卡池之上漲與下跌方向機率各為 50%（企劃書 9.1，固定值）。</li>
          <li>
            板塊卡池之上漲與下跌方向機率，依當日該板塊內可抽股票之實際漲跌分布計算：
            <code className="mx-1 rounded bg-[var(--panel-2)] px-1.5 py-0.5 font-mono text-xs">
              板塊池上漲機率 = 板塊池內上漲股票數 ÷ 板塊池內可抽股票總數
            </code>
          </li>
        </ul>
      </section>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">稀有度機率（方向內目標機率）</h2>
        <p className="dim mb-3 text-sm">稀有度由個股過去 30 個交易日漲跌幅決定，不因卡池不同而改變。</p>
        <table className="w-full max-w-sm text-sm">
          <thead>
            <tr className="dim text-left text-xs">
              <th className="py-1">稀有度</th>
              <th className="py-1">方向內機率</th>
              <th className="py-1">判定門檻</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <tr><td className="py-1">C</td><td>80.00%</td><td className="dim">0%～未滿5%</td></tr>
            <tr><td className="py-1">R</td><td>15.00%</td><td className="dim">5%～未滿15%</td></tr>
            <tr><td className="py-1">SR</td><td>4.00%</td><td className="dim">15%～未滿30%</td></tr>
            <tr><td className="py-1">SSR</td><td>1.00%</td><td className="dim">30%以上</td></tr>
          </tbody>
        </table>
        <p className="dim mt-2 text-xs">下跌卡依照跌幅絕對值採用相同門檻。</p>
      </section>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">跳變演出（僅效果，不影響機率）</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            抽中 <b>SR</b> 時，有 1/10 機率以「R 蓄力 → 跳升 SR」的演出登場
            （占全部抽卡約 0.4%）。
          </li>
          <li>
            抽中 <b>SSR</b> 時，有 1/10 機率以「SR 蓄力 → 跳升 SSR」的演出登場
            （占全部抽卡約 0.1%）。
          </li>
          <li>
            跳變純為呈現效果：稀有度判定與入池紀錄均以實際結果為準，不會改變任何機率，
            也不會影響保底或統計。
          </li>
        </ul>
      </section>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">空池處理規則</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>抽中某方向與稀有度，但該池內無符合股票：維持原方向，稀有度降低一級重新確認，直至抽出。</li>
          <li>方向機率依實際分布計算，正常情況不會抽到完全無股票之方向。</li>
          <li>板塊卡池資料不足時，系統回報錯誤並不消耗抽卡，不會自動退回其他卡池。</li>
        </ol>
      </section>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">卡池開放政策</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>所有卡池常態開放，無活動週期鎖池設計</li>
          <li>
            單方向池照常開放（企劃書 5.4 方案 B）：若某池當日全為上漲或全為下跌，
            該池方向機率即為該方向 100%，並於上方「當日各卡池分布」揭露
          </li>
          <li>需有最近完整交易日收盤價，且可計算過去 30 個交易日漲跌幅方可入池</li>
          <li>板塊卡池範圍：上市普通股依 TWSE 產業別映射至板塊；AI 池為人工策展主題池，股票可同時屬於多個卡池</li>
        </ul>
      </section>

      <section className="panel p-6">
        <h2 className="mb-3 font-bold">當日各卡池分布</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="dim text-left text-xs">
              <th className="py-1">卡池</th>
              <th className="py-1">資料日</th>
              <th className="py-1 text-right">可抽</th>
              <th className="py-1 text-right">漲/跌</th>
              <th className="py-1 text-right">稀有度分布</th>
              <th className="py-1 text-right">狀態</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => {
              const snap = p.snapshot;
              const rc = p.rarityCounts ?? {};
              return (
                <tr key={p.poolId} className="border-t border-[var(--line)]">
                  <td className="py-2 font-bold">{p.board?.tagName ?? p.poolName}</td>
                  <td className="dim py-2 font-mono text-xs">{snap?.snapshotDate ?? "-"}</td>
                  <td className="py-2 text-right font-mono">{snap?.stockCount ?? "-"}</td>
                  <td className="py-2 text-right font-mono">
                    {snap ? `${snap.upStockCount}/${snap.downStockCount}` : "-"}
                  </td>
                  <td className="py-2 text-right font-mono text-xs">
                    ▲C{rc.UP?.C ?? 0} R{rc.UP?.R ?? 0} SR{rc.UP?.SR ?? 0} SSR{rc.UP?.SSR ?? 0}　▼C
                    {rc.DOWN?.C ?? 0} R{rc.DOWN?.R ?? 0} SR{rc.DOWN?.SR ?? 0} SSR
                    {rc.DOWN?.SSR ?? 0}
                  </td>
                  <td
                    className="py-2 text-right font-bold"
                    style={{ color: snap?.isOpen ? "var(--up)" : "var(--ink-dim)" }}
                  >
                    {snap ? (snap.isOpen ? "開放" : (snap.reason ?? "未開放")) : "無快照"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dim mt-3 text-xs leading-relaxed">
          實際機率以當日卡池快照與系統公告為準。若指定稀有度於該板塊池中無可抽股票，系統將依空池處理規則調整（降級後抽出）。每日精選池於後續版本開放。
        </p>
      </section>
    </div>
  );
}
