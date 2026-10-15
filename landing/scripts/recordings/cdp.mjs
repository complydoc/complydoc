// A small driver for Chrome over its DevTools protocol, with a real mouse.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
// Chrome where it usually is on a Mac or on Linux, or wherever CHROME says.
const CHROME =
  process.env.CHROME ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    (path) => existsSync(path),
  );
if (!CHROME) throw new Error("No Chrome found; set CHROME to its path.");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function open(width, height, scale = 1) {
  const profile = mkdtempSync(join(tmpdir(), "complydoc-drive-"));
  const port = 9400 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 200 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
  let id = 0; const waiting = new Map(); const errors = [];
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  };
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; waiting.set(n, res); socket.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
    return r.result?.result?.value;
  };
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
  return {
    send, evaluate, errors,
    goto: async (url, wait = 3000) => { await send("Page.navigate", { url }); await sleep(wait); },
    shot: async (path) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(r.result.data, "base64")); },
    move: (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 }),
    click: async (x, y) => { await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); },
    drag: async (x0, y0, x1, y1, steps = 12, onStep = null) => {
      await mouse("mousePressed", x0, y0);
      for (let i = 1; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
        if (onStep) await onStep(i, x, y); else await sleep(20);
      }
      await mouse("mouseReleased", x1, y1);
    },
    type: (text) => send("Input.insertText", { text }),
    key: (key) => send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: key === "Enter" ? 13 : 0 }).then(() => send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key })),
    close: () => { socket.close(); chrome.kill("SIGKILL"); try { rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
}
// Where a passage starts and ends on screen, inside the document's reading.
export const SPAN = `window.__span = (text) => {
  const root = document.querySelector('[data-testid="page-reading"]');
  if (!root) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let all = "", nodes = [];
  for (let n; (n = walker.nextNode()); ) { nodes.push([n, all.length]); all += n.data; }
  const at = all.indexOf(text);
  if (at < 0) return { missing: all.slice(0, 300) };
  const locate = (offset) => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= offset) return [nodes[i][0], offset - nodes[i][1]]; };
  const range = document.createRange();
  range.setStart(...locate(at)); range.setEnd(...locate(at + text.length));
  const rects = [...range.getClientRects()].filter((r) => r.width > 1);
  const first = rects[0], last = rects[rects.length - 1];
  return { x0: first.left + 1, y0: first.top + first.height / 2, x1: last.right - 1, y1: last.top + last.height / 2, box: [range.getBoundingClientRect().x, range.getBoundingClientRect().y, range.getBoundingClientRect().width, range.getBoundingClientRect().height] };
}`;
