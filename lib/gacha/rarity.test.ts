import { describe, expect, it } from "vitest";
import { classifyChange, downgradeRarity } from "./rarity";

describe("classifyChange（企劃書 1.2 門檻）", () => {
  it("0% 歸上漲 C", () => {
    expect(classifyChange(0)).toEqual({ direction: "UP", rarity: "C" });
  });

  it("上漲門檻邊界", () => {
    expect(classifyChange(0.01).rarity).toBe("C");
    expect(classifyChange(4.99).rarity).toBe("C");
    expect(classifyChange(5).rarity).toBe("R");
    expect(classifyChange(14.99).rarity).toBe("R");
    expect(classifyChange(15).rarity).toBe("SR");
    expect(classifyChange(29.99).rarity).toBe("SR");
    expect(classifyChange(30).rarity).toBe("SSR");
  });

  it("下跌取絕對值同門檻，方向 DOWN", () => {
    expect(classifyChange(-0.01)).toEqual({ direction: "DOWN", rarity: "C" });
    expect(classifyChange(-5).rarity).toBe("R");
    expect(classifyChange(-15).rarity).toBe("SR");
    expect(classifyChange(-30).rarity).toBe("SSR");
    expect(classifyChange(-100).direction).toBe("DOWN");
  });
});

describe("downgradeRarity（企劃書 10.2 空池降級）", () => {
  it("SSR→SR→R→C，C 不可再降", () => {
    expect(downgradeRarity("SSR")).toBe("SR");
    expect(downgradeRarity("SR")).toBe("R");
    expect(downgradeRarity("R")).toBe("C");
    expect(downgradeRarity("C")).toBeNull();
  });
});
