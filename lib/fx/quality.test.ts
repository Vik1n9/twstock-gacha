import { afterEach, describe, expect, it, vi } from "vitest";
import { detectTier, profileFor, startFrameLoop, type FxTier } from "./quality";

// ── 假的 rAF／document／performance：讓幀率治理可以逐幀手動推進
function harness() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, FrameRequestCallback>();
  const visListeners = new Set<() => void>();
  const doc = {
    hidden: false,
    addEventListener: (_: string, cb: () => void) => void visListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => void visListeners.delete(cb),
  };

  const g = globalThis as Record<string, unknown>;
  const saved = {
    raf: g.requestAnimationFrame,
    caf: g.cancelAnimationFrame,
    doc: g.document,
    perf: g.performance,
  };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  g.cancelAnimationFrame = (id: number) => void pending.delete(id);
  g.document = doc;
  g.performance = { now: () => now };

  return {
    /** 推進 deltaMs 並把目前排隊的 callback 全部跑一輪 */
    tick(deltaMs: number) {
      now += deltaMs;
      const due = [...pending.entries()];
      pending.clear();
      for (const [, cb] of due) cb(now);
    },
    advance(deltaMs: number) {
      now += deltaMs;
    },
    setHidden(hidden: boolean) {
      doc.hidden = hidden;
      for (const cb of visListeners) cb();
    },
    get scheduled() {
      return pending.size;
    },
    get listenerCount() {
      return visListeners.size;
    },
    restore() {
      g.requestAnimationFrame = saved.raf;
      g.cancelAnimationFrame = saved.caf;
      g.document = saved.doc;
      g.performance = saved.perf;
    },
  };
}

let h: ReturnType<typeof harness> | null = null;

afterEach(() => {
  h?.restore();
  h = null;
});

describe("detectTier", () => {
  it("觸控裝置一律不給 high：手機的持續散熱能力撐不住全螢幕 bloom", () => {
    expect(detectTier({ coarsePointer: true, cores: 16, memoryGb: 8 })).toBe("mid");
  });

  it("核心數或記憶體偏低的觸控裝置降到 low", () => {
    expect(detectTier({ coarsePointer: true, cores: 4, memoryGb: 8 })).toBe("low");
    expect(detectTier({ coarsePointer: true, cores: 8, memoryGb: 2 })).toBe("low");
  });

  it("桌機依核心數與記憶體分 mid / high", () => {
    expect(detectTier({ cores: 4, memoryGb: 16 })).toBe("mid");
    expect(detectTier({ cores: 16, memoryGb: 4 })).toBe("mid");
    expect(detectTier({ cores: 16, memoryGb: 16 })).toBe("high");
  });

  it("讀不到任何提示時退回保守的中間值", () => {
    expect(detectTier({})).toBe("mid");
  });
});

describe("profileFor", () => {
  const tiers: FxTier[] = ["low", "mid", "high"];

  it("每個成本旋鈕都隨檔次單調遞增", () => {
    const p = tiers.map(profileFor);
    for (let i = 1; i < p.length; i++) {
      expect(p[i].maxDpr).toBeGreaterThanOrEqual(p[i - 1].maxDpr);
      expect(p[i].particleScale).toBeGreaterThanOrEqual(p[i - 1].particleScale);
      expect(p[i].godRays).toBeGreaterThanOrEqual(p[i - 1].godRays);
      expect(p[i].fps).toBeGreaterThanOrEqual(p[i - 1].fps);
      expect(p[i].idleFps).toBeGreaterThanOrEqual(p[i - 1].idleFps);
      expect(p[i].burstFps).toBeGreaterThanOrEqual(p[i - 1].burstFps);
    }
  });

  it("停留在結果頁的張數一定低於演出中的張數", () => {
    for (const t of tiers) {
      const p = profileFor(t);
      expect(p.idleFps).toBeLessThan(p.fps);
    }
  });

  it("短暫的命中特效張數高於持續演出：發熱來自持續滿載，不是一兩秒的尖峰", () => {
    for (const t of tiers) {
      const p = profileFor(t);
      expect(p.burstFps).toBeGreaterThanOrEqual(p.fps);
    }
  });

  // 張數會被螢幕更新率量化（60Hz 只給得出 60/30/20/15），所以「比 fps 大」還不夠：
  // burstFps 45 在 60Hz 螢幕上會退化成 30，與 fps 30 毫無差別，等於白設。
  it("命中特效在 60Hz 螢幕上真的比持續演出快，而不是量化後退回同一格", () => {
    // 完全比照 startFrameLoop 的判斷（含 2ms 容差）：在 60Hz 螢幕上，
    // 目標張數會被無條件進位到「每 k 幀畫一次」
    const achievable = (target: number, refreshHz = 60) => {
      const framePeriod = 1000 / refreshHz;
      const k = Math.max(1, Math.ceil((1000 / target - 2) / framePeriod));
      return refreshHz / k;
    };
    for (const t of tiers) {
      const p = profileFor(t);
      // 持續演出本來就已經是滿速的檔次（high），命中特效追平即可
      if (p.fps >= 60) expect(achievable(p.burstFps)).toBe(achievable(p.fps));
      else expect(achievable(p.burstFps)).toBeGreaterThan(achievable(p.fps));
    }
  });

  it("mid 的 45fps 在 60Hz 螢幕上實得 30fps、在 120Hz 上實得 40fps", () => {
    const achievable = (target: number, refreshHz: number) => {
      const framePeriod = 1000 / refreshHz;
      return refreshHz / Math.max(1, Math.ceil((1000 / target - 2) / framePeriod));
    };
    expect(achievable(45, 60)).toBe(30);
    expect(achievable(45, 120)).toBe(40);
  });

  it("命中特效仍設有天花板，120Hz 螢幕不會讓工作量直接翻倍", () => {
    for (const t of tiers) {
      expect(profileFor(t).burstFps).toBeLessThanOrEqual(60);
    }
  });

  it("low 不做 bloom 與噪點這兩個全螢幕合成步驟", () => {
    expect(profileFor("low").bloom).toBe(false);
    expect(profileFor("low").grain).toBe(false);
  });
});

describe("startFrameLoop", () => {
  it("把繪製張數壓在目標值：60Hz 螢幕上跑 30fps 只畫一半", () => {
    h = harness();
    const draw = vi.fn();
    const stop = startFrameLoop({ fps: () => 30, draw });
    for (let i = 0; i < 10; i++) h.tick(16);
    expect(draw).toHaveBeenCalledTimes(5);
    stop();
  });

  it("目標張數等於螢幕更新率時不會被容差誤判成跳幀", () => {
    h = harness();
    const draw = vi.fn();
    const stop = startFrameLoop({ fps: () => 60, draw });
    for (let i = 0; i < 10; i++) h!.tick(16.7);
    expect(draw).toHaveBeenCalledTimes(10);
    stop();
  });

  it("120Hz 螢幕上目標 60fps 只畫一半，工作量不會跟著更新率翻倍", () => {
    h = harness();
    const draw = vi.fn();
    const stop = startFrameLoop({ fps: () => 60, draw });
    for (let i = 0; i < 12; i++) h!.tick(8.33);
    expect(draw).toHaveBeenCalledTimes(6);
    stop();
  });

  it("dt 以秒計，且鉗在 0.05 秒內（分頁切回時不會爆衝）", () => {
    h = harness();
    const dts: number[] = [];
    const stop = startFrameLoop({ fps: () => 60, draw: (_now, dt) => dts.push(dt) });
    h.tick(20);
    h.tick(5000);
    expect(dts[0]).toBeCloseTo(0.02, 5);
    expect(dts[1]).toBe(0.05);
    stop();
  });

  it("分頁隱藏時完全停機，切回來才恢復", () => {
    h = harness();
    const draw = vi.fn();
    const stop = startFrameLoop({ fps: () => 60, draw });
    h.tick(20);
    expect(draw).toHaveBeenCalledTimes(1);

    h.setHidden(true);
    expect(h.scheduled).toBe(0);
    h.tick(20);
    h.tick(20);
    expect(draw).toHaveBeenCalledTimes(1);

    h.setHidden(false);
    h.tick(20);
    expect(draw).toHaveBeenCalledTimes(2);
    stop();
  });

  it("繪製持續超出時間預算時回報，讓呼叫端降級", () => {
    h = harness();
    const onBudgetExceeded = vi.fn();
    // 每幀吃 40ms，遠超 60fps 的 16.7ms 預算
    const stop = startFrameLoop({
      fps: () => 60,
      draw: () => h!.advance(40),
      onBudgetExceeded,
    });
    for (let i = 0; i < 120; i++) h.tick(16);
    expect(onBudgetExceeded).toHaveBeenCalled();
    stop();
  });

  it("繪製在預算內時不會誤觸降級", () => {
    h = harness();
    const onBudgetExceeded = vi.fn();
    const stop = startFrameLoop({
      fps: () => 60,
      draw: () => h!.advance(1),
      onBudgetExceeded,
    });
    for (let i = 0; i < 200; i++) h.tick(16);
    expect(onBudgetExceeded).not.toHaveBeenCalled();
    stop();
  });

  it("stop() 之後不再排程，也不留下 visibilitychange 監聽", () => {
    h = harness();
    const draw = vi.fn();
    const stop = startFrameLoop({ fps: () => 60, draw });
    h.tick(20);
    stop();
    expect(h.scheduled).toBe(0);
    expect(h.listenerCount).toBe(0);
    h.tick(20);
    expect(draw).toHaveBeenCalledTimes(1);
  });
});
