// 新板塊定義模板 —— 複製到 lib/sectors/defs.ts 的 BOARD_DEFS 內使用。
// 搭配 docs/卡片與卡池擴充規範.md §4、§5 服用。
//
// 上線最小條件：tagId / tagName / description / active / theme.primary / accent / bg
// 其餘 theme 欄位是特效分派用的預留 config，未實作前會吃預設行為，可先照填不影響上線。

import type { BoardDef, SectorTheme } from "@/lib/sectors/defs";

// ── 1) 主題色 ───────────────────────────────────────────────
// primary：板塊主色。背景星雲、透視隧道、粒子、板塊名都吃它。
//          選中高彩度、在 #0b0e13 深底上看得清楚的顏色。
// accent ：強調色。徽章、電路節點、神光束、卡背切角吃它。
//          與 primary 拉開明度差（一深一亮），否則演出會糊成一片。
// bg     ：演出層底色。用 primary 壓到近黑（明度 ~8%），不要用純黑。
const theme: SectorTheme = {
  primary: "#7C4DFF",
  accent: "#448AFF",
  bg: "#0D0A1A",

  // ── 2) 特效分派 config（beta 逐項接上，見規範 §5）────────
  // particleShape：背景粒子造型。目前一律畫方塊晶粒。
  //   spark | node | chip | coin | bubble | petal
  particleShape: "node",

  // motif：背景母題。目前一律畫 circuit 透視隧道。
  //   circuit | neural | waves | dna | signal | lens | speedline |
  //   skyline | furnace | molecule | turbine | none
  motif: "neural",

  // tenLayout：十連卡背排列。目前一律 wafer_grid（中央 1 + 環形 9）。
  //   wafer_grid | grid | wall | windows
  tenLayout: "grid",

  // ssrSignature：SSR 簽名特效。目前一律 WaferBurst。
  //   wafer_burst | core_explosion | none
  ssrSignature: "core_explosion",
};

// ── 3) 板塊定義 ─────────────────────────────────────────────
// tagId       ：全大寫短碼，同時是 boards.tag_id 與 poolIdFor() 的輸入（POOL_<tagId>）
// description ：卡池頁與首頁板塊條會顯示，寫這個板塊涵蓋哪些細產業
// active      ：true 才會被 seed 建立卡池、才會出現在抽卡選單
export const BOARD_TEMPLATE: BoardDef = {
  tagId: "AI",
  tagName: "AI 與運算",
  description: "伺服器、GPU、ASIC、邊緣運算、高速運算",
  active: true,
  theme,
};

// ── 4) 上線 checklist ───────────────────────────────────────
// [ ] lib/sectors/defs.ts        把本定義加進 BOARD_DEFS（或把既有項目改 active: true）
// [ ] lib/sectors/industry-map.ts 確認 TWSE 產業別代碼 → tagId；標「未驗證」者
//                                 必須先用 2–3 檔已知個股比對 t187ap03_L 後才可信
// [ ] scripts/seed.ts             目前 SEMI 寫死，需改為迴圈跑所有 active 板塊
//                                 （fetchAndFilterSemi / pools 插入 / 停用比對 三處）
// [ ] npm run seed && npm run backfill && npm run snapshot
// [ ] 檢查 pools.min_stock_count：冷門板塊不足 30 檔會被 gatePool() 關閉，
//                                 需個別調低而不是改全域預設
// [ ] /pools 與 /odds 確認新池有出現、稀有度分布合理
