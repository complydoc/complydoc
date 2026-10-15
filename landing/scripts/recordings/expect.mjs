// Records the viewer: a passage selected with the mouse, expected, then the scoreboard.
//   node expect.mjs <viewer url> <out dir> <light|dark>
import { mkdirSync, writeFileSync } from "node:fs";
import { open, sleep, SPAN } from "./cdp.mjs";
const [base, out, theme] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const W = 1440, H = 900, RATIO = 1200 / 750, MIN = 640;
const b = await open(W, H, 2);
const frames = []; let n = 0;
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const cam = (rect, pad = 30) => {
  if (!rect) return [0, 0, W];
  const [x, y, w, h] = rect; const ww = w + 2 * pad, hh = h + 2 * pad;
  const width = Math.min(W, Math.max(MIN, ww, hh * RATIO)), height = width / RATIO;
  const cx = x - pad + ww / 2, cy = y - pad + hh / 2;
  return [Math.min(Math.max(cx - width / 2, 0), W - width), Math.min(Math.max(cy - height / 2, 0), H - height), width];
};
const mix = (a, z, t) => {
  const width = Math.exp(Math.log(a[2]) + (Math.log(z[2]) - Math.log(a[2])) * t);
  const ca = [a[0] + a[2] / 2, a[1] + a[2] / RATIO / 2], cz = [z[0] + z[2] / 2, z[1] + z[2] / RATIO / 2];
  const cx = ca[0] + (cz[0] - ca[0]) * t, cy = ca[1] + (cz[1] - ca[1]) * t;
  return [cx - width / 2, cy - width / RATIO / 2, width];
};
let last = null;
const snap = async (camera, opts = {}) => { const file = `f${String(n++).padStart(4, "0")}.png`; await b.shot(`${out}/${file}`); last = file; frames.push({ file, cam: camera, ...opts }); };
const hold = (camera, count) => { for (let i = 0; i < count; i++) frames.push({ file: last, cam: camera }); };
const CURSOR = `(() => { const c = document.createElement("div"); c.id = "__cursor"; c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:22px;transform:translate(-100px,-100px)";
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8.5-6.2 1.3 3.6 6.6-2.6 1.4-3.6-6.7L5.6 19z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c); window.__cursor = (x, y) => { c.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)"; }; })()`;
let mouse = [980, 520];
const place = (x, y) => { mouse = [x, y]; return b.evaluate(`__cursor(${x}, ${y})`); };
const glide = async (to, count, camFrom, camTo, pressed = false) => {
  const from = [...mouse];
  for (let i = 1; i <= count; i++) {
    const t = ease(i / count); const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t;
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: pressed ? "left" : "none", buttons: pressed ? 1 : 0 });
    await place(x, y); await snap(mix(camFrom, camTo, t));
  }
};
const at = (label) => b.evaluate(`(() => { const e = [...document.querySelectorAll("button,[role=tab]")].find((x) => x.innerText.trim() === ${JSON.stringify(label)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
const box = (expr) => b.evaluate(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
try {
  // The document, in its Text view.
  await b.goto(base, 1500); await b.evaluate(`localStorage.setItem("complydoc.sidebar", "closed")`);
  await b.goto(`${base}?run=complydoc.json&theme=${theme}#documents/7`, 4000);
  const tab = await at("Text"); await b.click(...tab); await sleep(1000);
  await b.evaluate(SPAN); await b.evaluate(CURSOR); await place(...mouse);
  const start = await b.evaluate(`__span("Invoices are payable within")`);
  const end = await b.evaluate(`__span("fourteen days of the invoice date")`);
  const full = cam(null);
  const reading = cam([start.box[0] - 60, start.box[1] - 90, 520, 260], 0);
  await snap(full); hold(full, 26);
  await glide([start.x0, start.y0], 30, full, reading);
  hold(reading, 8);
  // Drag over the passage.
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: start.x0, y: start.y0, button: "left", buttons: 1, clickCount: 1 });
  await glide([end.x1, end.y1], 30, reading, reading, true);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: end.x1, y: end.y1, button: "left", buttons: 0, clickCount: 1 });
  for (let i = 0; i < 6; i++) { await sleep(40); await snap(reading); }
  hold(reading, 16);
  const expect = await at("Expect this passage");
  await glide(expect, 16, reading, reading);
  hold(reading, 10);
  await b.click(...expect);
  for (let i = 0; i < 10; i++) { await sleep(40); await snap(mix(reading, full, ease((i + 1) / 24))); }
  for (let i = 10; i < 24; i++) { await sleep(40); await snap(mix(reading, full, ease((i + 1) / 24))); }
  hold(full, 34);
  // The Evals page.
  await b.goto(`${base}?run=complydoc.json&theme=${theme}#evals`, 3500);
  await b.evaluate(CURSOR);
  await snap(full, { fade: true }); hold(full, 14);
  const board = await box(`document.querySelector("main table")`);
  const facts = await box(`[...document.querySelectorAll("main *")].find((x) => x.children.length === 0 && x.innerText && x.innerText.trim() === "Invoices are payable within fourteen days of the invoice date")`);
  const target = cam([board[0], board[1] - 50, board[2], (facts ? facts[1] + 90 : board[1] + board[3]) - board[1] + 50], 20);
  for (let i = 1; i <= 30; i++) frames.push({ file: last, cam: mix(full, target, ease(i / 30)) });
  hold(target, 80);
  for (let i = 1; i <= 26; i++) frames.push({ file: last, cam: mix(target, full, ease(i / 26)) });
  hold(full, 12);
  writeFileSync(`${out}/frames.json`, JSON.stringify({ scale: 2, fps: 30, frames }));
  console.log(`${frames.length} frames, ${n} stills, errors ${JSON.stringify(b.errors)}`);
} finally { b.close(); }
