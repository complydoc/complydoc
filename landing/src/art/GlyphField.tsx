import { useEffect, useRef } from "react";

/**
 * The footer's backdrop: a field of monospaced characters on deep blue, the way a loader sees a
 * page before anyone reads it. Brighter, denser characters gather into a wave that rises from the
 * bottom left and breaks towards the right. Drawn once per size, not animated.
 */
const RAMP = " .·:-=+*#%@";
const WORDS = "complydoc loaders trace hidden text personal data router gateway evals ".split("");

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(canvas: HTMLCanvasElement) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cw = 9;
  const ch = 15;
  ctx.font = `500 11px "Geist Mono Variable", ui-monospace, monospace`;
  ctx.textBaseline = "top";
  const random = rng(7);
  let word = 0;
  // On a phone the links sit over the wave, so it stays quieter there.
  const quiet = width < 640 ? 0.5 : 1;

  for (let y = 0; y < height; y += ch) {
    for (let x = 0; x < width; x += cw) {
      const u = x / width;
      const v = y / height;
      // The crest of the wave: low on the left, rising and curling over to the right.
      const crest = 0.95 - 0.7 * Math.pow(u, 1.25) + 0.05 * Math.sin(u * 8 + 0.6);
      const d = v - crest;
      // Under the crest the water thins out slowly; above it, only spray.
      const body = d > 0 ? 0.25 + 0.75 * Math.exp(-d * 2.4) : Math.exp(-(d * d) / 0.004);
      const foam = Math.exp(-(d * d) / 0.0016);
      const swell = 0.5 + 0.5 * Math.sin(u * 19 + v * 13) * Math.cos(u * 5 - v * 23);
      const grain = random();
      let level = (body * (0.45 + 0.55 * swell) + foam * 0.7) * (0.35 + 0.65 * Math.min(1, u * 1.3));
      level = Math.min(1, level * (0.55 + 0.6 * grain));
      // A faint scatter everywhere, so the whole block has texture.
      if (level < 0.07) {
        if (grain > 0.965) {
          ctx.fillStyle = "rgba(120, 196, 232, 0.16)";
          ctx.fillText(".", x, y);
        }
        continue;
      }

      let glyph = RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length))] ?? ".";
      if (foam > 0.5 && grain > 0.35) {
        glyph = WORDS[word++ % WORDS.length] ?? " ";
        if (glyph === " ") continue;
      }
      const alpha = (0.1 + level * 0.7) * quiet * (v > 0.8 ? 0.45 : 1);
      ctx.fillStyle = level > 0.72 ? `rgba(226, 245, 252, ${alpha})` : `rgba(110, 192, 232, ${alpha})`;
      ctx.fillText(glyph, x, y);
    }
  }
}

export function GlyphField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => draw(canvas));
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    void document.fonts?.ready.then(redraw);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />;
}
