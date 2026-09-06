"use client";

import { useLowFx } from "@/lib/hooks/useLowFx";

export function LowFxToggle() {
  const [low, setLow] = useLowFx();
  return (
    <button
      type="button"
      onClick={() => setLow(!low)}
      className="dim shrink-0 whitespace-nowrap rounded-full border border-[var(--line)] px-2.5 py-1.5 text-xs hover:text-[var(--ink)]"
      title="低特效模式（尊重系統減少動態設定）"
    >
      特效：{low ? "低" : "完整"}
    </button>
  );
}
