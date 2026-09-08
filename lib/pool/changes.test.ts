import { describe, expect, it } from "vitest";
import { toChangeCards, type ChangeRow } from "./changes";

const DATE = "2026-09-08";

const row = (over: Partial<ChangeRow> & { stockCode: string }): ChangeRow => ({
  stockName: `股票${over.stockCode}`,
  boardCode: "SEMI",
  direction: "UP",
  rarity: "R",
  prevRarity: null,
  close: 100,
  change1d: 1,
  change30d: 8,
  rarityChangedOn: null,
  directionChangedOn: null,
  ...over,
});

const boardNames = new Map([["SEMI", "半導體"]]);

describe("toChangeCards", () => {
  it("只留當天變動的列，沿用舊標記的不算", () => {
    const cards = toChangeCards(
      [
        row({ stockCode: "1111", rarityChangedOn: DATE, prevRarity: "C" }),
        row({ stockCode: "2222", rarityChangedOn: "2026-09-04", prevRarity: "C" }),
        row({ stockCode: "3333", directionChangedOn: DATE }),
        row({ stockCode: "4444", directionChangedOn: "2026-08-20" }),
      ],
      boardNames,
      DATE,
    );
    expect(cards.map((c) => c.stockCode)).toEqual(["1111", "3333"]);
    expect(cards[0].rarityChanged).toBe(true);
    expect(cards[0].directionChanged).toBe(false);
    expect(cards[1].directionChanged).toBe(true);
  });

  it("升降階以 prevRarity 判定；prevRarity 為 null 時 move 為 null", () => {
    const cards = toChangeCards(
      [
        row({ stockCode: "1111", rarity: "SR", prevRarity: "R", rarityChangedOn: DATE }),
        row({ stockCode: "2222", rarity: "R", prevRarity: "SSR", rarityChangedOn: DATE }),
        row({ stockCode: "3333", rarity: "R", prevRarity: null, rarityChangedOn: DATE }),
      ],
      boardNames,
      DATE,
    );
    const move = new Map(cards.map((c) => [c.stockCode, c.rarityMove]));
    expect(move.get("1111")).toBe("up");
    expect(move.get("2222")).toBe("down");
    expect(move.get("3333")).toBeNull();
  });

  it("依漲跌幅絕對值由大到小排序，同幅度以代號排序", () => {
    const cards = toChangeCards(
      [
        row({ stockCode: "1111", change30d: 6, directionChangedOn: DATE }),
        row({ stockCode: "2222", change30d: -31, directionChangedOn: DATE }),
        row({ stockCode: "3333", change30d: 16, directionChangedOn: DATE }),
        row({ stockCode: "4444", change30d: -6, directionChangedOn: DATE }),
      ],
      boardNames,
      DATE,
    );
    expect(cards.map((c) => c.stockCode)).toEqual(["2222", "3333", "1111", "4444"]);
  });

  it("板塊代碼轉名稱，無歸屬或查無對應時為 null", () => {
    const cards = toChangeCards(
      [
        row({ stockCode: "1111", rarityChangedOn: DATE }),
        row({ stockCode: "2222", boardCode: null, rarityChangedOn: DATE }),
        row({ stockCode: "3333", boardCode: "NOPE", rarityChangedOn: DATE }),
      ],
      boardNames,
      DATE,
    );
    const names = new Map(cards.map((c) => [c.stockCode, c.boardName]));
    expect(names.get("1111")).toBe("半導體");
    expect(names.get("2222")).toBeNull();
    expect(names.get("3333")).toBeNull();
  });

  it("同一天稀有度與方向都變的列，兩個旗標都是 true", () => {
    const [card] = toChangeCards(
      [
        row({
          stockCode: "1111",
          direction: "DOWN",
          rarity: "SR",
          prevRarity: "C",
          change30d: -17.8,
          rarityChangedOn: DATE,
          directionChangedOn: DATE,
        }),
      ],
      boardNames,
      DATE,
    );
    expect(card.rarityChanged).toBe(true);
    expect(card.directionChanged).toBe(true);
    expect(card.rarityMove).toBe("up");
    expect(card.direction).toBe("DOWN");
  });
});
