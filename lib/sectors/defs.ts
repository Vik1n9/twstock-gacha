// 企劃書 4.1 首版 16 板塊定義
// alpha 僅啟用 SEMI；theme 為特效系統參數（P6 完整版特效，config 驅動）

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
  active: boolean; // alpha 僅 SEMI
  theme: SectorTheme;
}

const placeholder: SectorTheme = {
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
    description: "伺服器、GPU、ASIC、邊緣運算、高速運算",
    active: false,
    theme: { ...placeholder, primary: "#7C4DFF", accent: "#448AFF", bg: "#0D0A1A", particleShape: "node", motif: "neural", ssrSignature: "core_explosion" },
  },
  {
    tagId: "ELEC",
    tagName: "電子製造",
    description: "電子代工、組裝、系統製造",
    active: false,
    theme: { ...placeholder, primary: "#1976D2", accent: "#ECEFF1", bg: "#0A1018" },
  },
  {
    tagId: "COMP",
    tagName: "電腦與週邊",
    description: "主機板、筆電、鍵盤、滑鼠、電腦週邊",
    active: false,
    theme: { ...placeholder, primary: "#26C6DA", accent: "#B2EBF2", bg: "#081214", motif: "circuit" },
  },
  {
    tagId: "COMM",
    tagName: "通信網路",
    description: "網通設備、電信、光通訊、衛星通信",
    active: false,
    theme: { ...placeholder, primary: "#00ACC1", accent: "#26A69A", bg: "#061214", motif: "signal" },
  },
  {
    tagId: "OPTO",
    tagName: "光電光學",
    description: "面板、鏡頭、光學元件、LED",
    active: false,
    theme: { ...placeholder, primary: "#7E57C2", accent: "#26C6DA", bg: "#0D0A14", motif: "lens" },
  },
  {
    tagId: "PART",
    tagName: "電子零組件",
    description: "被動元件、連接器、PCB、電源供應",
    active: false,
    theme: { ...placeholder, primary: "#FB8C00", accent: "#42A5F5", bg: "#140E08", motif: "circuit" },
  },
  {
    tagId: "AUTO",
    tagName: "車電與汽車",
    description: "車用電子、汽車零組件、電動車相關",
    active: false,
    theme: { ...placeholder, primary: "#E53935", accent: "#B0BEC5", bg: "#120A0A", motif: "speedline" },
  },
  {
    tagId: "FIN",
    tagName: "金融保險",
    description: "銀行、保險、金控、證券、期貨",
    active: false,
    theme: { ...placeholder, primary: "#D4A017", accent: "#F5F5F5", bg: "#131006", particleShape: "coin", motif: "skyline", tenLayout: "windows" },
  },
  {
    tagId: "STEEL",
    tagName: "鋼鐵原物料",
    description: "鋼鐵、金屬、水泥、原物料相關",
    active: false,
    theme: { ...placeholder, primary: "#90A4AE", accent: "#FF7043", bg: "#101012", motif: "furnace" },
  },
  {
    tagId: "CHEM",
    tagName: "塑膠化學",
    description: "塑膠、化學、材料、特化",
    active: false,
    theme: { ...placeholder, primary: "#66BB6A", accent: "#78909C", bg: "#0A1210", particleShape: "bubble", motif: "molecule" },
  },
  {
    tagId: "CONS",
    tagName: "消費傳產",
    description: "食品、紡織、零售、消費用品",
    active: false,
    theme: { ...placeholder, primary: "#FFA726", accent: "#FFE0B2", bg: "#14100A", particleShape: "petal" },
  },
  {
    tagId: "BIO",
    tagName: "生技醫療",
    description: "生技、製藥、醫療器材、健康照護",
    active: false,
    theme: { ...placeholder, primary: "#66BB6A", accent: "#E0F2F1", bg: "#081210", motif: "dna" },
  },
  {
    tagId: "SHIP",
    tagName: "航運物流",
    description: "航運、貨櫃、港口、物流",
    active: false,
    theme: { ...placeholder, primary: "#039BE5", accent: "#4FC3F7", bg: "#061019", motif: "waves", tenLayout: "wall" },
  },
  {
    tagId: "TOUR",
    tagName: "觀光餐旅",
    description: "飯店、餐飲、旅遊、休閒服務",
    active: false,
    theme: { ...placeholder, primary: "#FF7043", accent: "#F48FB1", bg: "#140C0A" },
  },
  {
    tagId: "GREEN",
    tagName: "綠能環保",
    description: "太陽能、風電、儲能、重電、環保",
    active: false,
    theme: { ...placeholder, primary: "#7CB342", accent: "#FDD835", bg: "#0A1208", motif: "turbine" },
  },
];

export const BOARD_MAP: Record<string, BoardDef> = Object.fromEntries(
  BOARD_DEFS.map((b) => [b.tagId, b]),
);

// 企劃書 16.3 poolId 命名慣例
export function poolIdFor(tagId: string): string {
  return `POOL_${tagId}`;
}
