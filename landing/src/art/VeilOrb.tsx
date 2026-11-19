import { useEffect, useRef } from "react";

/** Points spread evenly over a sphere (a Fibonacci lattice). */
const POINTS = (() => {
  const n = 1500;
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    return [Math.cos(a) * r, y, Math.sin(a) * r] as const;
  });
})();

/**
 * A sphere of points turning slowly, leaning towards the pointer. The points on the near side
 * are the brand blue; on the far side they fade, so it reads as a solid without any gradient.
 */
export function VeilOrb({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tiltX = 0.35;
    let tiltY = 0;
    let aimX = 0.35;
    let aimY = 0;
    let raf = 0;
    const start = performance.now();

    const onPointer = (event: PointerEvent) => {
      aimY = (event.clientX / innerWidth - 0.5) * 0.8;
      aimX = 0.35 + (event.clientY / innerHeight - 0.5) * 0.5;
    };
    if (!still) addEventListener("pointermove", onPointer);

    const draw = (now: number) => {
      const ratio = devicePixelRatio || 1;
      const size = element.clientWidth;
      if (element.width !== size * ratio) {
        element.width = size * ratio;
        element.height = size * ratio;
      }
      const style = getComputedStyle(element);
      const blue = style.getPropertyValue("--primary").trim() || "#56b4e0";
      const ink = style.getPropertyValue("--foreground").trim() || "#111";
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size, size);

      tiltX += (aimX - tiltX) * 0.04;
      tiltY += (aimY - tiltY) * 0.04;
      const spin = still ? 0.6 : ((now - start) / 1000) * 0.18;
      const ay = spin + tiltY;
      const [sy, cy, sx, cx] = [Math.sin(ay), Math.cos(ay), Math.sin(tiltX), Math.cos(tiltX)];
      const radius = size * 0.42;
      const middle = size / 2;
      // A band of the sphere is veiled: points inside it are drawn as short dashes.
      const band = still ? 0.15 : Math.sin(((now - start) / 1000) * 0.4) * 0.6;

      for (const [x0, y0, z0] of POINTS) {
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y2 = y0 * cx - z1 * sx;
        const z2 = y0 * sx + z1 * cx;
        const depth = (z2 + 1) / 2; // 0 at the back, 1 at the front
        const px = middle + x1 * radius;
        const py = middle + y2 * radius;
        const veiled = Math.abs(y0 - band) < 0.12;
        context.globalAlpha = 0.12 + depth * 0.88;
        context.fillStyle = veiled ? ink : blue;
        if (veiled) context.fillRect(px - 2.4, py - 0.6, 4.8, 1.2);
        else {
          context.beginPath();
          context.arc(px, py, 0.5 + depth * 1.2, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className={className} />;
}
