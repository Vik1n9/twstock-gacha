"use client";

// 演出層元件的集中出口。
//
// GachaStage 以動態 import 載入本模組，讓 GSAP 與所有 canvas 演出元件
// （約 96 KB）打包成獨立 chunk，不進首頁的首屏 bundle：玩家還沒按下抽卡
// 之前不需要這些程式碼。載入時機見 GachaStage 的 preloadFx()。
//
// 注意：新增演出元件時要一併在這裡匯出，否則它會被靜態 import 拉回首屏。

export { SectorBackdrop } from "./SectorBackdrop";
export { PreRoll } from "./PreRoll";
export { FlipCard } from "./FlipCard";
export { WaferGrid } from "./WaferGrid";
export { WaferBurst } from "./WaferBurst";
export { Resonance } from "./Resonance";
export { RevealFx } from "./RevealFx";
export { CardDetail } from "@/components/cards/CardDetail";
