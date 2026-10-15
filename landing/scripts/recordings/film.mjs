// A recording of the viewer: a real mouse, a drawn cursor, and a camera that moves between
// parts of the page. Each frame is a still and where the camera is; render.py makes the video.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, sleep } from "./cdp.mjs";
export { sleep };

const RATIO = 1200 / 750, MIN = 640;
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const CURSOR = `(() => { if (document.getElementById("__cursor")) return; const c = document.createElement("div"); c.id = "__cursor"; c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:22px;transform:translate(-100px,-100px)";
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3 3.6 6.6-2.6 1.4-3.6-6.7L5.6 19z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c); window.__cursor = (x, y) => { c.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)"; }; })()`;
// The smallest element holding the text, then up to the closest match of a selector.
const FIND = `window.__el = (text, closest) => { let best = null; for (const el of document.querySelectorAll("body *")) { if (el.id === "__cursor" || el.closest("#__cursor")) continue; const t = (el.innerText || "").trim(); if (t.includes(text) && el.getClientRects().length && (!best || t.length <= (best.innerText || "").trim().length)) best = el; } if (best && closest) best = best.closest(closest) || best; return best; }`;

/** A 16:10 box around `rect`, inside a window `W` wide. */
function frame(W, rect, pad, min = MIN) {
  const H = W / RATIO;
  if (!rect) return [0, 0, W];
  const [x, y, w, h] = rect; const ww = w + 2 * pad, hh = h + 2 * pad;
  const width = Math.min(W, Math.max(min, ww, hh * RATIO)), height = width / RATIO;
  const cx = x - pad + ww / 2, cy = y - pad + hh / 2;
  return [Math.min(Math.max(cx - width / 2, 0), W - width), Math.min(Math.max(cy - height / 2, 0), H - height), width];
}
const mix = (a, z, t) => {
  const width = Math.exp(Math.log(a[2]) + (Math.log(z[2]) - Math.log(a[2])) * t);
  const ca = [a[0] + a[2] / 2, a[1] + a[2] / RATIO / 2], cz = [z[0] + z[2] / 2, z[1] + z[2] / RATIO / 2];
  const cx = ca[0] + (cz[0] - ca[0]) * t, cy = ca[1] + (cz[1] - ca[1]) * t;
  return [cx - width / 2, cy - width / RATIO / 2, width];
};

export async function film(bases, out, theme, W = 1440) {
  mkdirSync(out, { recursive: true });
  const H = Math.round(W / RATIO);
  const camera = (rect, pad = 30, min = MIN) => frame(W, rect, pad, min);
  const b = await open(W, H, 2);
  for (const base of bases) { await b.goto(base, 1200); await b.evaluate(`localStorage.setItem("complydoc.sidebar", "closed")`); }
  const frames = []; let n = 0, last = null, at = camera(null), mouse = [W * 0.7, H * 0.62], fade = false;
  const prepare = async () => { await b.evaluate(FIND); await b.evaluate(CURSOR); await b.evaluate(`__cursor(${mouse[0]}, ${mouse[1]})`); };
  const snap = async (cam = at) => { const file = `f${String(n++).padStart(4, "0")}.png`; await b.shot(`${out}/${file}`); last = file; at = cam; frames.push(fade ? { file, cam, fade: true } : { file, cam }); fade = false; };
  const f = {
    b, theme, camera, full: camera(null),
    /** Open a page; the next frame fades in from the last one. */
    goto: async (url, wait = 3500) => { await b.goto("about:blank", 150); await b.goto(url, wait); await prepare(); fade = frames.length > 0; },
    prepare,
    snap,
    /** Stay where the camera is, on the last still. */
    hold: (count) => { for (let i = 0; i < count; i++) frames.push({ file: last, cam: at }); },
    /** Move the camera over the last still. */
    pan: (to, count = 30) => { const from = at; for (let i = 1; i <= count; i++) frames.push({ file: last, cam: mix(from, to, ease(i / count)) }); at = to; },
    /** Move the mouse, and the camera with it when `to` is given, taking a still each step. */
    glide: async (point, count = 16, to = at, pressed = false) => {
      const from = [...mouse], cam0 = at;
      for (let i = 1; i <= count; i++) {
        const t = ease(i / count); const x = from[0] + (point[0] - from[0]) * t, y = from[1] + (point[1] - from[1]) * t;
        await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: pressed ? "left" : "none", buttons: pressed ? 1 : 0 });
        await b.evaluate(`__cursor(${x}, ${y})`); mouse = [x, y]; await snap(mix(cam0, to, t));
      }
    },
    press: () => b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: mouse[0], y: mouse[1], button: "left", buttons: 1, clickCount: 1 }),
    release: () => b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mouse[0], y: mouse[1], button: "left", buttons: 0, clickCount: 1 }),
    /** Click where the mouse is, then take stills while the page answers. */
    click: async (stills = 8, gap = 60) => { await b.click(mouse[0], mouse[1]); for (let i = 0; i < stills; i++) { await sleep(gap); await b.evaluate(`window.__cursor && __cursor(${mouse[0]}, ${mouse[1]})`).catch(() => {}); await prepare(); await snap(); } },
    /** Type into the focused field, a still for each character. */
    type: async (text, every = 1) => { let i = 0; for (const ch of text) { await b.type(ch); if (++i % every === 0) { await sleep(25); await snap(); frames.push({ file: last, cam: at }); } } await snap(); },
    /** Where something is: [x, y, width, height], or null. */
    rect: (text, closest = null) => b.evaluate(`(() => { const e = __el(${JSON.stringify(text)}, ${JSON.stringify(closest)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`),
    css: (selector) => b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`),
    eval: (js) => b.evaluate(js),
    finish: () => { writeFileSync(`${out}/frames.json`, JSON.stringify({ scale: 2, fps: 30, frames })); const errors = b.errors; b.close(); return { frames: frames.length, stills: n, errors }; },
    close: () => b.close(),
  };
  return f;
}
export const centre = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
export const around = (...rects) => { const rs = rects.filter(Boolean); const x = Math.min(...rs.map((r) => r[0])), y = Math.min(...rs.map((r) => r[1])), X = Math.max(...rs.map((r) => r[0] + r[2])), Y = Math.max(...rs.map((r) => r[1] + r[3])); return [x, y, X - x, Y - y]; };
