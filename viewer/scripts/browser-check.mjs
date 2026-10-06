// The viewer in a real browser: every page answers, nothing covers what must be clicked.
//
//   node viewer/scripts/browser-check.mjs http://127.0.0.1:8765/
//
// Chrome is driven over its DevTools protocol, headless, with a profile of its own. Each
// case is a fresh browser at one width, either as a new visitor or as one whose browser
// remembers the trace widened. After every step the page is asked for 1 + 1: a page stuck
// rendering never answers, which no test in jsdom has shown. Exits 1 on the first failure.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
const pipeline = process.argv[3] ?? "contracts-ingest";
if (!url) {
  console.error("usage: browser-check.mjs <viewer url> [pipeline name]");
  process.exit(2);
}

const CHROME =
  process.env.CHROME ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(
    (path) => existsSync(path),
  );
if (!CHROME) {
  console.error("No Chrome found; set CHROME to its path.");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ANSWER_WITHIN_MS = 8000;

class Hung extends Error {}

async function browser(width, height, port) {
  const profile = mkdtempSync(join(tmpdir(), "complydoc-check-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let target;
  for (let tries = 0; tries < 75 && !target; tries++) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
    } catch {
      // Chrome is still starting.
    }
  }
  if (!target) throw new Error("Chrome did not start");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, resolve);
      socket.send(JSON.stringify({ id: n, method, params }));
      setTimeout(() => {
        if (waiting.delete(n)) reject(new Hung(`${method} got no answer in ${ANSWER_WITHIN_MS} ms`));
      }, ANSWER_WITHIN_MS);
    });
  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description ?? "script failed");
    return reply.result?.result?.value;
  };
  const close = () => {
    chrome.kill("SIGKILL");
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // The profile is in the temporary folder either way.
    }
  };
  return { send, evaluate, close };
}

// What the page is asked, as scripts run in it. Each returns a small value to check.
const page = {
  open: (name) => `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(name)}); b?.click(); return !!b; })()`,
  openRun: `(() => { const c = document.querySelectorAll('table tbody tr')[0]?.querySelectorAll('td')[1]; c?.click(); return !!c; })()`,
  runs: `document.querySelectorAll('table tbody tr').length`,
  panel: `(() => {
    const p = document.querySelector('aside[aria-label=Trace]');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const c = p.querySelector('[aria-label=Close]').getBoundingClientRect();
    const gap = document.querySelector('[data-slot=sidebar-gap]')?.getBoundingClientRect();
    const link = [...document.querySelectorAll('[data-sidebar=menu-button]')].find(e => e.innerText.split('\\n')[0] === 'Security');
    const lr = link?.getBoundingClientRect();
    return {
      left: Math.round(r.left), top: Math.round(r.top), sidebar: Math.round(gap?.right ?? 0),
      closeOnTop: p.contains(document.elementFromPoint(c.left + 5, c.top + 5)),
      sidebarLinkOnTop: !!link && link.contains(document.elementFromPoint(lr.left + 20, lr.top + lr.height / 2)),
    };
  })()`,
  closePanel: `(() => { document.querySelector('aside[aria-label=Trace] [aria-label=Close]')?.click(); return true; })()`,
  hasPanel: `!!document.querySelector('aside[aria-label=Trace]')`,
  sortBy: (header) => `(() => { const b = [...document.querySelectorAll('table th button')].find(e => e.textContent.trim() === ${JSON.stringify(header)}); b?.click(); return !!b; })()`,
  hash: `location.hash`,
  go: (hash) => `(() => { location.hash = ${JSON.stringify(hash)}; return true; })()`,
  searchMenu: `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); return true; })()`,
  pick: (label) => `(() => { const o = [...document.querySelectorAll('[role=option]')].find(e => e.textContent.startsWith(${JSON.stringify(label)})); o?.click(); return !!o; })()`,
  pickFinding: `(() => { const b = document.querySelector('[aria-label="Select this row"]'); b?.click(); return !!b; })()`,
  bar: `document.querySelector('[role=toolbar][aria-label="Selected rows"]')?.textContent ?? ''`,
  widen: `(() => { localStorage.setItem('complydoc.trace-panel-wide', '1'); return true; })()`,
  heading: `document.querySelector('header nav')?.innerText.split('\\n').pop() ?? ''`,
};

async function check(name, width, height, widened, port) {
  const chrome = await browser(width, height, port);
  const failures = [];
  const expect = (what, ok, got) => {
    if (!ok) failures.push(`${what} (got ${JSON.stringify(got)})`);
  };
  // A step, then the question a stuck page cannot answer.
  const step = async (what, expression, settle = 700) => {
    try {
      const value = await chrome.evaluate(expression);
      await sleep(settle);
      await chrome.evaluate("1 + 1");
      return value;
    } catch (error) {
      if (error instanceof Hung) throw new Hung(`the page stopped answering at: ${what}`);
      throw error;
    }
  };
  try {
    await chrome.send("Page.enable");
    await chrome.send("Runtime.enable");
    await chrome.send("Page.navigate", { url });
    await sleep(2500);
    if (widened) await step("remembering the trace widened", page.widen, 100);

    expect("the pipeline is listed", await step("opening the pipeline", page.open(pipeline), 1200), true);
    const runs = await step("counting the runs", page.runs, 100);
    expect("more than five runs, so the table sorts", runs > 5, runs);
    expect("a run opens", await step("opening a run", page.openRun, 1200), true);
    const panel = await step("measuring the trace", page.panel, 100);
    expect("the trace is open", panel !== null, panel);
    if (panel && widened) {
      expect("widened, the trace starts at the window's corner", panel.left === 0 && panel.top === 0, panel);
      expect("widened, its Close is on top", panel.closeOnTop, panel);
    } else if (panel) {
      expect("beside the runs, the trace stops at the sidebar", panel.left >= panel.sidebar, panel);
      expect("beside the runs, the sidebar's links are on top", panel.sidebarLinkOnTop, panel);
      expect("its Close is on top", panel.closeOnTop, panel);
    }
    await step("closing the trace", page.closePanel);
    expect("Close closes the trace", (await step("checking it closed", page.hasPanel, 100)) === false, true);

    if (!widened) {
      expect("the runs sort by duration", await step("sorting the runs", page.sortBy("Duration")), true);
      expect("a run opens once sorted", await step("opening a run, sorted", page.openRun, 1200), true);
      await step("opening the search menu", page.searchMenu);
      expect("the search menu lists Security", await step("picking Security", page.pick("Security"), 900), true);
      expect("Security opens", (await step("reading the address", page.hash, 100)).startsWith("#security"), "");
      if (await step("picking a finding", page.pickFinding)) {
        const bar = await step("reading the bar", page.bar, 100);
        expect("picking a finding shows the bar", bar.includes("1 selected"), bar);
      }
      for (const [hash, heading] of [["#documents", "Documents"], ["#home", "Dashboard"], ["#settings", "Settings"], ["#pipeline", "Traces"]]) {
        await step(`going to ${hash}`, page.go(hash), 900);
        expect(`${hash} shows ${heading}`, (await step("reading the heading", page.heading, 100)) === heading, hash);
      }
      expect("a run opens after coming back", await step("opening a run again", page.openRun, 1200), true);
    }
  } catch (error) {
    failures.push(error instanceof Hung ? `HUNG: ${error.message}` : `ERROR: ${error.message}`);
  } finally {
    chrome.close();
  }
  console.log(`${failures.length ? "FAIL" : "ok  "}  ${name}`);
  for (const failure of failures) console.log(`      ${failure}`);
  return failures.length === 0;
}

let passed = true;
let port = 9400;
for (const [width, height] of [[800, 700], [1450, 900]]) {
  for (const widened of [false, true]) {
    const name = `${width}px, ${widened ? "trace remembered as widened" : "a new visitor"}`;
    passed = (await check(name, width, height, widened, port++)) && passed;
  }
}
process.exit(passed ? 0 : 1);
