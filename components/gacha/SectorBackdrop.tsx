"use client";

import { useEffect, useRef } from "react";
import type { SectorTheme } from "@/lib/sectors/defs";
import { Camera, damp, fitCanvas, hexRgb, mulberry32, rgba, rgbHex } from "@/lib/fx/core";
import { fxProfile, startFrameLoop } from "@/lib/fx/quality";

// 板塊主題背景（3D 深度場）
// 圖層：星雲 → 透視電路隧道 → 深度晶片粒子 → 神光束 → 輝光 bloom → 顆粒噪點
// boost 0..1 由抽卡階段驅動：拉高速度、拉長速度線、加強光束（十連/SSR 時再往上推）
//
// 這一層是唯一「從抽卡開始到玩家關閉為止都在畫」的全螢幕特效，發熱量主要來自它。
// 三道節流：解析度跟著裝置檔次（fxProfile）、張數由 startFrameLoop 設上限、
// idle（結果頁停留）時再降一階並關掉 bloom／噪點這兩個全螢幕合成步驟。
export function SectorBackdrop({
  theme,
  low = false,
  intensity = 1,
  boost = 0,
  hue = null,
  idle = false,
}: {
  theme: SectorTheme;
  low?: boolean;
  intensity?: number;
  boost?: number;
  /** 覆蓋強調色（例如 SSR 預告轉金色） */
  hue?: string | null;
  /** 演出已結束、玩家正在看結果：背景只要活著，不需要全速 */
  idle?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const boostRef = useRef(0);
  const targetRef = useRef(boost);
  const hueRef = useRef<string | null>(hue);
  const idleRef = useRef(idle);

  useEffect(() => {
    targetRef.current = boost;
    hueRef.current = hue;
    idleRef.current = idle;
  }, [boost, hue, idle]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const cam = new Camera();
    const rnd = mulberry32(20260906);
    const profile = fxProfile();

    // 可下修的品質旋鈕：startFrameLoop 量到繪製持續超支時，
    // 依「最貴的先關」順序單向降級（不會再升回去，避免在臨界點來回抖動）。
    const q = {
      bloom: profile.bloom,
      grain: profile.grain,
      godRays: profile.godRays,
      chipRatio: 1,
      fpsScale: 1,
    };

    let w = 0;
    let h = 0;
    let ctx: CanvasRenderingContext2D | null = null;
    let disposed = false;

    // 輝光用的低解析離屏 canvas（1/4 解析度模糊後疊加，成本低效果好）
    const glowCanvas = document.createElement("canvas");
    const glowCtx = glowCanvas.getContext("2d");

    // 顆粒噪點貼圖（預先產生一次，之後只做位移）
    let grainPattern: CanvasPattern | null = null;
    const grain = document.createElement("canvas");
    grain.width = 128;
    grain.height = 128;
    {
      const g = grain.getContext("2d");
      if (g) {
        const img = g.createImageData(128, 128);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 120 + Math.floor(rnd() * 135);
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
      }
    }

    interface Chip {
      x: number;
      y: number;
      z: number;
      vz: number;
      rot: number;
      vrot: number;
      size: number;
      accent: boolean;
      twinkle: number;
    }

    interface Nebula {
      x: number;
      y: number;
      r: number;
      phase: number;
      speed: number;
      color: string;
    }

    let chips: Chip[] = [];
    let nebulas: Nebula[] = [];
    const FAR = 1500;

    const spawnChip = (z?: number): Chip => ({
      x: (rnd() - 0.5) * 2400,
      y: (rnd() - 0.5) * 1700,
      z: z ?? 40 + rnd() * FAR,
      vz: -(60 + rnd() * 150),
      rot: rnd() * Math.PI,
      vrot: (rnd() - 0.5) * 1.6,
      size: 4 + rnd() * 12,
      accent: rnd() < 0.34,
      twinkle: rnd() * Math.PI * 2,
    });

    function build(): CanvasRenderingContext2D | null {
      const fit = fitCanvas(canvas!);
      if (!fit) return null;
      ctx = fit.ctx;
      w = fit.w;
      h = fit.h;
      cam.resize(w, h);

      glowCanvas.width = Math.max(1, Math.round(w / 4));
      glowCanvas.height = Math.max(1, Math.round(h / 4));

      const area = w * h;
      const count = Math.round(
        clampNum(area / 5200, 90, 340) *
          intensity *
          profile.particleScale *
          q.chipRatio,
      );
      chips = Array.from({ length: count }, () => spawnChip());

      // pattern 綁在 context 上，重建 context 後要重新產生（每幀建一次是白工）
      grainPattern = ctx.createPattern(grain, "repeat");

      nebulas = [
        { x: 0.24, y: 0.28, r: 0.62, phase: 0, speed: 0.11, color: theme.primary },
        { x: 0.78, y: 0.66, r: 0.55, phase: 2.1, speed: 0.08, color: theme.accent },
        { x: 0.5, y: 1.02, r: 0.75, phase: 4.2, speed: 0.06, color: theme.primary },
      ];
      return ctx;
    }

    // 指標視差：滑鼠/觸控偏移讓整個深度場產生輕微擺動
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    // 強調色不硬切：每幀往目標色逼近，跳變卡在卡背轉向時的「低階色 → 結果色」
    // 因此是一段約 0.3 秒的過場，而不是背景瞬間換一個顏色。
    const accentRgb = hexRgb(hueRef.current ?? theme.accent);
    let accentHex = rgbHex(accentRgb);
    function stepAccent(dt: number) {
      const target = hexRgb(hueRef.current ?? theme.accent);
      accentRgb.r = damp(accentRgb.r, target.r, 11, dt);
      accentRgb.g = damp(accentRgb.g, target.g, 11, dt);
      accentRgb.b = damp(accentRgb.b, target.b, 11, dt);
      accentHex = rgbHex(accentRgb);
    }

    function accentColor(): string {
      return accentHex;
    }

    // ── 星雲底層：緩慢呼吸的大面積徑向漸層
    function drawNebula(t: number) {
      const c = ctx!;
      c.globalCompositeOperation = "lighter";
      for (const n of nebulas) {
        const pulse = 0.5 + 0.5 * Math.sin(t * n.speed + n.phase);
        const cx = n.x * w + Math.sin(t * 0.07 + n.phase) * w * 0.05;
        const cy = n.y * h + Math.cos(t * 0.05 + n.phase) * h * 0.05;
        const r = n.r * Math.max(w, h) * (0.85 + pulse * 0.25);
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, rgba(n.color, 0.16 + pulse * 0.1));
        g.addColorStop(0.45, rgba(n.color, 0.05));
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }
      c.globalCompositeOperation = "source-over";
    }

    // ── 透視電路隧道：上下兩片平面 + 沿 z 捲動的橫向線，構成往消失點收束的網格
    function drawTunnel(t: number, b: number, scroll: number) {
      const c = ctx!;
      const planes = [520, -520]; // 下方地板、上方天花板
      const step = 220;
      const spanX = 1700;
      const accent = accentColor();

      c.lineWidth = 1;
      for (const py of planes) {
        // 縱向導線（沿 z 延伸）
        for (let i = -4; i <= 4; i++) {
          const x = i * (spanX / 4);
          const a = cam.project(x, py, 40);
          const bp = cam.project(x, py, FAR);
          const grd = c.createLinearGradient(a.x, a.y, bp.x, bp.y);
          grd.addColorStop(0, rgba(theme.primary, 0.02));
          grd.addColorStop(0.35, rgba(theme.primary, 0.16 + b * 0.14));
          grd.addColorStop(1, rgba(theme.primary, 0));
          c.strokeStyle = grd;
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(bp.x, bp.y);
          c.stroke();
        }
        // 橫向掃過的環（越近越亮越粗，做出「衝過來」的速度感）
        for (let k = 0; k < 9; k++) {
          const z = ((k * step + scroll) % (step * 9)) + 60;
          const fade = 1 - z / (step * 9 + 60);
          const l = cam.project(-spanX, py, z);
          const r = cam.project(spanX, py, z);
          c.strokeStyle = rgba(theme.primary, 0.05 + fade * (0.22 + b * 0.3));
          c.lineWidth = 0.6 + fade * (1.4 + b * 2.2);
          c.beginPath();
          c.moveTo(l.x, l.y);
          c.lineTo(r.x, r.y);
          c.stroke();

          // 節點：每條環上的電路焊點
          if (fade > 0.35) {
            c.fillStyle = rgba(accent, (fade - 0.35) * (0.5 + b * 0.5));
            for (let i = -4; i <= 4; i++) {
              const p = cam.project(i * (spanX / 4), py, z);
              const s = 1 + fade * 3.5;
              c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            }
          }
        }
      }
      c.lineWidth = 1;
    }

    // ── 深度晶片粒子：帶 z 的方塊，近大遠小、近亮遠暗；boost 時拉成速度線
    function drawChips(t: number, b: number, dt: number) {
      const c = ctx!;
      const accent = accentColor();
      const speedMul = 1 + b * 7;

      for (const p of chips) {
        p.z += p.vz * speedMul * dt;
        p.rot += p.vrot * dt * (1 + b * 2);
        if (p.z < 30) {
          Object.assign(p, spawnChip(FAR + rnd() * 240));
          continue;
        }
        const pr = cam.project(p.x, p.y, p.z);
        if (pr.x < -200 || pr.x > w + 200 || pr.y < -200 || pr.y > h + 200) continue;

        const depth = 1 - p.z / (FAR + 240);
        const tw = 0.65 + 0.35 * Math.sin(t * 3 + p.twinkle);
        const alpha = Math.min(1, depth * 1.25) * tw * (0.35 + b * 0.4);
        if (alpha <= 0.01) continue;
        const size = p.size * pr.s;
        const col = p.accent ? accent : theme.primary;

        // 速度線：boost 越高，粒子沿運動方向拖出的殘影越長
        if (b > 0.05) {
          const tail = cam.project(p.x, p.y, p.z + 160 * b * speedMul * 0.02 * 60);
          c.strokeStyle = rgba(col, alpha * 0.55 * b);
          c.lineWidth = Math.max(0.6, size * 0.35);
          c.beginPath();
          c.moveTo(pr.x, pr.y);
          c.lineTo(tail.x, tail.y);
          c.stroke();
        }

        c.save();
        c.translate(pr.x, pr.y);
        c.rotate(p.rot);
        c.fillStyle = rgba(col, alpha);
        c.fillRect(-size / 2, -size / 2, size, size);
        // 晶片切角：近距離才畫，遠處省成本
        if (size > 7) {
          c.strokeStyle = rgba(p.accent ? accent : "#ffffff", alpha * 0.7);
          c.lineWidth = Math.max(0.5, size * 0.08);
          c.strokeRect(-size / 2, -size / 2, size, size);
          c.fillStyle = rgba("#ffffff", alpha * 0.5);
          c.fillRect(-size / 2, -size / 2, size * 0.26, size * 0.26);
        }
        c.restore();
      }
    }

    // ── 神光束：從畫面上緣斜射下來的體積光錐
    function drawGodRays(t: number, b: number) {
      const c = ctx!;
      const accent = accentColor();
      const rays = q.godRays;
      if (rays <= 0) return;
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < rays; i++) {
        const sway = Math.sin(t * 0.35 + i * 1.7) * 0.5 + 0.5;
        const x = (i + 0.5) / rays * w + Math.sin(t * 0.2 + i) * w * 0.06;
        const width = w * (0.06 + sway * 0.05);
        const alpha = (0.035 + sway * 0.05) * (0.55 + b * 1.1);
        const g = c.createLinearGradient(x, -h * 0.1, x - w * 0.16, h * 1.05);
        g.addColorStop(0, rgba(i % 2 ? accent : theme.primary, alpha));
        g.addColorStop(0.55, rgba(i % 2 ? accent : theme.primary, alpha * 0.35));
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x - width, -h * 0.1);
        c.lineTo(x + width, -h * 0.1);
        c.lineTo(x + width - w * 0.16, h * 1.05);
        c.lineTo(x - width - w * 0.16, h * 1.05);
        c.closePath();
        c.fill();
      }
      c.globalCompositeOperation = "source-over";
    }

    // ── 輝光：整幀縮到 1/4 → 模糊 → 以 lighter 疊回，得到廉價但漂亮的 bloom
    //
    // 模糊在「1/4 解析度的離屏 canvas」上做，不是疊回主畫布時才做：
    // canvas filter 的成本算在目的地像素上，半徑同樣視覺效果下差約 16 倍工作量。
    // 放大貼回時的雙線性內插又順手多給一層柔化，所以半徑改成 1/4。
    function drawBloom(b: number, mix: number) {
      if (!glowCtx) return;
      const gw = glowCanvas.width;
      const gh = glowCanvas.height;
      glowCtx.globalCompositeOperation = "source-over";
      glowCtx.clearRect(0, 0, gw, gh);
      glowCtx.filter = `blur(${2 + b * 2}px)`;
      glowCtx.drawImage(canvas!, 0, 0, gw, gh);
      glowCtx.filter = "none";
      const c = ctx!;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = (0.42 + b * 0.3) * mix;
      c.drawImage(glowCanvas, 0, 0, w, h);
      c.restore();
    }

    function drawGrain(t: number, mix: number) {
      if (!grainPattern) return;
      const c = ctx!;
      c.save();
      c.globalAlpha = 0.045 * mix;
      c.globalCompositeOperation = "overlay";
      const ox = -(Math.floor(t * 37) % 128);
      const oy = -(Math.floor(t * 53) % 128);
      c.translate(ox, oy);
      c.fillStyle = grainPattern;
      c.fillRect(0, 0, w + 128, h + 128);
      c.restore();
    }

    ctx = build();

    let scroll = 0;
    // 進出「結果頁停留」時 bloom／噪點淡入淡出，避免背景亮度瞬間跳一階
    let heavyMix = 1;

    function frame(now: number, dt: number) {
      if (disposed || !ctx) return;
      const t = now / 1000;

      boostRef.current = damp(boostRef.current, targetRef.current, 4.5, dt);
      const b = boostRef.current;
      stepAccent(dt);

      pointer.x = damp(pointer.x, pointer.tx, 3, dt);
      pointer.y = damp(pointer.y, pointer.ty, 3, dt);
      cam.cx = w / 2 - pointer.x * 46;
      cam.cy = h / 2 - pointer.y * 34;

      scroll = (scroll + dt * (140 + b * 1400)) % (220 * 9);

      ctx.clearRect(0, 0, w, h);
      drawNebula(t);
      drawTunnel(t, b, scroll);
      drawChips(t, b, dt);
      drawGodRays(t, b);
      // 結果頁停留時收掉兩個全螢幕合成步驟：bloom 要把整張畫面讀回來（GPU→CPU
      // 同步，最貴的一步），噪點是全螢幕 overlay 混色，兩者都與畫面內容無關。
      heavyMix = damp(heavyMix, idleRef.current ? 0 : 1, 5, dt);
      if (heavyMix > 0.02) {
        if (q.bloom) drawBloom(b, heavyMix);
        if (q.grain) drawGrain(t, heavyMix);
      }
    }

    if (low) {
      // 低特效：靜態一幀，不跑 rAF、不掛事件
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        drawNebula(0);
        drawTunnel(0, 0, 0);
        drawChips(0, 0, 0);
      }
      return () => {
        disposed = true;
      };
    }

    // 降級順序＝成本由高到低：bloom → 噪點 → 神光束 → 粒子 → 張數
    const degrade = () => {
      if (q.bloom) q.bloom = false;
      else if (q.grain) q.grain = false;
      else if (q.godRays > 2) q.godRays = 2;
      else if (q.chipRatio > 0.5) {
        q.chipRatio = 0.5;
        ctx = build();
      } else if (q.fpsScale > 0.5) q.fpsScale = 0.5;
    };

    const stopLoop = startFrameLoop({
      fps: () =>
        (idleRef.current ? profile.idleFps : profile.fps) * q.fpsScale,
      draw: frame,
      onBudgetExceeded: degrade,
    });

    window.addEventListener("pointermove", onPointer, { passive: true });
    const onResize = () => {
      ctx = build();
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      stopLoop();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [theme, low, intensity]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: theme.bg }}>
      <canvas ref={ref} className="h-full w-full" />
      {/* 暈影：把視線收束到畫面中央 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(72% 58% at 50% 48%, transparent 30%, rgba(0,0,0,0.42) 78%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      {/* 頂部主題暈染 */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          background: `radial-gradient(88% 52% at 50% -4%, color-mix(in srgb, ${theme.primary} 22%, transparent), transparent 68%)`,
        }}
      />
    </div>
  );
}

function clampNum(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
