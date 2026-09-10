// 企劃書 4.1 首版 16 板塊定義（beta v1：全部啟用，主題合併）
// 分類採「產業＋主題混合」（企劃書 3.1）：TWSE 產業別經主題合併進 16 板塊，
// 對照表見 lib/sectors/industry-map.ts；AI 池為人工策展（ai-curate.ts）。
// theme 為特效系統參數（config 驅動）；§5 特效分派未實作前，只有
// primary/accent/bg 生效，其餘欄位吃預設行為。

export type ParticleShape = "spark" | "node" | "chip" | "coin" | "bubble" | "petal";
export type TenLayout = "wafer_grid" | "grid" | "wall" | "windows";
export type SsrSignature = "wafer_burst" | "core_explosion" | "none";

export interface SectorTheme {
  primary: string; // 主題色
  accent: string; // 強調色（金/亮色）
  bg: string; // 演出背景基色
  particleShape: ParticleShape;
  motif: string; // 背景母題繪製函式 key：circuit、waves、dna…
  tenLayout: TenLayout; // 十連卡背排列
  ssrSignature: SsrSignature; // SSR 簽名特效
}

export interface BoardDef {
  tagId: string;
  tagName: string;
  description: string;
  active: boolean;
  theme: SectorTheme;
}

export const placeholder: SectorTheme = {
  primary: "#888888",
  accent: "#CCCCCC",
  bg: "#0D0D0F",
  particleShape: "spark",
  motif: "none",
  tenLayout: "grid",
  ssrSignature: "none",
};

export const BOARD_DEFS: BoardDef[] = [
  {
    tagId: "SEMI",
    tagName: "半導體",
    description: "晶圓代工、IC 設計、封測、半導體設備、半導體材料",
    active: true,
    theme: {
      primary: "#E0483E", // 紅
      accent: "#F5C044", // 金
      bg: "#160B0C",
      particleShape: "chip",
      motif: "circuit",
      tenLayout: "wafer_grid",
      ssrSignature: "wafer_burst",
    },
  },
  {
    tagId: "AI",
    tagName: "AI 與運算",
    description: "伺服器、ASIC、散熱電源、交換器、AI 供應鏈與雲端服務（人工策展池）",
    active: true,
    theme: {
      primary: "#7C4DFF", // 紫
      accent: "#448AFF", // 藍
      bg: "#0D0A1A",
      particleShape: "node",
      motif: "neural",
      tenLayout: "grid",
      ssrSignature: "core_explosion",
    },
  },
  {
    tagId: "ELEC",
    tagName: "電子製造",
    description: "電子代工、組裝、系統製造、電機機械、工具機與重電",
    active: true,
    theme: {
      primary: "#2E7DD1", // 工業藍
      accent: "#ECEFF1", // 白
      bg: "#0A1220",
      particleShape: "spark",
      motif: "circuit",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "COMP",
    tagName: "電腦與週邊",
    description: "主機板、筆電、電腦週邊、3C 與 IC 通路",
    active: true,
    theme: {
      primary: "#26C6DA", // 青
      accent: "#B2EBF2", // 淡青
      bg: "#081214",
      particleShape: "spark",
      motif: "circuit",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "COMM",
    tagName: "通信網路",
    description: "網通設備、電信、光通訊、衛星通信",
    active: true,
    theme: {
      primary: "#22B8F0", // 亮藍
      accent: "#4DD0E1", // 淡青藍
      bg: "#06121A",
      particleShape: "node",
      motif: "signal",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "OPTO",
    tagName: "光電光學",
    description: "面板、鏡頭、光學元件、LED",
    active: true,
    theme: {
      primary: "#AB47BC", // 洋紫
      accent: "#4DD7FE", // 青
      bg: "#100A18",
      particleShape: "spark",
      motif: "lens",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "PART",
    tagName: "電子零組件",
    description: "被動元件、連接器、PCB 載板、電源供應、電線電纜",
    active: true,
    theme: {
      primary: "#FF8F00", // 琥珀橙
      accent: "#29B6F6", // 亮藍
      bg: "#16100A",
      particleShape: "chip",
      motif: "circuit",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "AUTO",
    tagName: "車電與汽車",
    description: "車用電子、汽車零組件、輪胎、電動車相關",
    active: true,
    theme: {
      primary: "#E53935", // 車燈紅
      accent: "#CFD8DC", // 銀
      bg: "#100A0E",
      particleShape: "spark",
      motif: "speedline",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "FIN",
    tagName: "金融保險",
    description: "銀行、保險、金控、證券、期貨",
    active: true,
    theme: {
      primary: "#D4A017", // 金
      accent: "#F5F5F5", // 白
      bg: "#131006",
      particleShape: "coin",
      motif: "skyline",
      tenLayout: "windows",
      ssrSignature: "none",
    },
  },
  {
    tagId: "STEEL",
    tagName: "鋼鐵原物料",
    description: "鋼鐵、水泥、玻璃陶瓷、造紙與金屬原物料",
    active: true,
    theme: {
      primary: "#90A4AE", // 鋼灰
      accent: "#FF7043", // 熔爐橘
      bg: "#101014",
      particleShape: "spark",
      motif: "furnace",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "CHEM",
    tagName: "塑膠化學",
    description: "塑膠、化學、特化材料",
    active: true,
    theme: {
      primary: "#26A69A", // 青綠
      accent: "#9CCC65", // 檸綠
      bg: "#0A1412",
      particleShape: "bubble",
      motif: "molecule",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "CONS",
    tagName: "消費傳產",
    description: "食品、紡織、零售百貨、居家生活用品",
    active: true,
    theme: {
      primary: "#FFA726", // 暖橙
      accent: "#FFE0B2", // 奶油
      bg: "#14100A",
      particleShape: "petal",
      motif: "none",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "BIO",
    tagName: "生技醫療",
    description: "生技、製藥、醫療器材、健康照護",
    active: true,
    theme: {
      primary: "#66BB6A", // 綠
      accent: "#E0F2F1", // 白綠
      bg: "#081210",
      particleShape: "node",
      motif: "dna",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "SHIP",
    tagName: "航運物流",
    description: "海運貨櫃、航空、物流、造船與港埠",
    active: true,
    theme: {
      primary: "#1656B8", // 深海藍
      accent: "#4FC3F7", // 海光青
      bg: "#06101A",
      particleShape: "spark",
      motif: "waves",
      tenLayout: "wall",
      ssrSignature: "none",
    },
  },
  {
    tagId: "TOUR",
    tagName: "觀光休閒",
    description: "飯店、餐飲、旅遊、運動休閒與健身器材",
    active: true,
    theme: {
      primary: "#FF7043", // 霓虹珊瑚
      accent: "#F48FB1", // 粉
      bg: "#140C0A",
      particleShape: "petal",
      motif: "none",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
  {
    tagId: "GREEN",
    tagName: "能源綠能",
    description: "太陽能、風電、儲能、重電、油電燃氣與公用能源",
    active: true,
    theme: {
      primary: "#7CB342", // 綠
      accent: "#FDD835", // 能量黃
      bg: "#0A1208",
      particleShape: "spark",
      motif: "turbine",
      tenLayout: "grid",
      ssrSignature: "none",
    },
  },
];

export const BOARD_MAP: Record<string, BoardDef> = Object.fromEntries(
  BOARD_DEFS.map((b) => [b.tagId, b]),
);

// 企劃書 16.3 poolId 命名慣例
export function poolIdFor(tagId: string): string {
  return `POOL_${tagId}`;
}

// 全市場池（企劃書 2.1）：所有上市普通股、永久開放、方向機率固定 50/50（企劃書 9.1）
export const MARKET_POOL = {
  poolId: "POOL_ALL",
  poolCode: "ALL",
  poolName: "全市場池",
  poolType: "market" as const,
  minStockCount: 300,
  description: "所有上市普通股（不含 TDR）",
  theme: {
    primary: "#F2E9D8", // 象牙白
    accent: "#C8A24B", // 香檳金
    bg: "#0E0F12",
    particleShape: "spark",
    motif: "none",
    tenLayout: "grid",
    ssrSignature: "wafer_burst",
  } satisfies SectorTheme,
};

// 精選池（企劃書 2.1）：台灣市值前 50 大權值股，以 0050 成分股為基準的人工策展池。
// 成員清單在 lib/sectors/featured-curate.ts；非板塊池，relatedTagId 為 null。
export const FEATURED_POOL = {
  poolId: "POOL_TOP50",
  poolCode: "TOP50",
  poolName: "台灣50池",
  tagName: "台灣50", // 顯示名稱，與其他卡池（半導體、全市場…）對齊，不帶「池」
  poolType: "featured" as const,
  minStockCount: 30,
  description: "台灣市值前 50 大權值股（參考 0050 成分，人工策展）",
  theme: {
    primary: "#00BFA5", // 御璽綠
    accent: "#FFD54F", // 金
    bg: "#07130F",
    particleShape: "coin",
    motif: "skyline",
    tenLayout: "grid",
    ssrSignature: "core_explosion",
  } satisfies SectorTheme,
};
