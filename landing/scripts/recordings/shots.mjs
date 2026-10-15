// Whole panels of the viewer, sidebar folded, in both themes.  node shots.mjs <contracts url> <documents url> <out>
import { writeFileSync } from "node:fs";
import { open, sleep } from "./cdp.mjs";
const [a, d, out] = process.argv.slice(2);
const SPL = encodeURIComponent("RecursiveCharacterTextSplitter chunk_size=400 chunk_overlap=0");
const TRACE = encodeURIComponent("trace/contracts-ingest-20261013-230504.json");
const union = (sel) => `(() => { const rs = [...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0); if (!rs.length) return null; const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), X = Math.max(...rs.map((r) => r.right)), Y = Math.max(...rs.map((r) => r.bottom)); return [x, y, X - x, Y - y]; })()`;
const only = process.argv[5] ? process.argv[5].split(',') : null;
const all = [
  { name: "trace", size: [1440, 900], url: (t) => `${a}?run=${TRACE}&theme=${t}#pipeline?trace=open`, clip: null },
  { name: "document", size: [1000, 700], url: (t) => `${a}?run=complydoc.json&theme=${t}#documents/0?chunks=${SPL}`, text: true,
    clip: `(() => { const e = [...document.querySelectorAll("main div")].find((x) => { const c = (x.className || "").toString(); return c.includes("min-h-0") && c.includes("flex-1") && c.includes("flex-col") && x.getBoundingClientRect().width > 300; }); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()` },
  { name: "diff", size: [1000, 760], url: (t) => `${d}?run=complydoc.json&theme=${t}#documents/1`,
    clip: `(() => { const e = [...document.querySelectorAll("main div")].find((x) => { const c = (x.className || "").toString(); return c.includes("min-h-0") && c.includes("flex-1") && c.includes("flex-col") && x.getBoundingClientRect().width > 300; }); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()` },
  { name: "security", size: [1000, 900], url: (t) => `${d}?run=complydoc.json&theme=${t}#security`,
    clip: `(() => { const s = [...document.querySelectorAll("main section")].filter((e) => /^(Found|What and where)/.test(e.innerText)); const rs = s.map((e) => e.getBoundingClientRect()); const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)), X = Math.max(...rs.map((r) => r.right)), Y = Math.max(...rs.map((r) => r.bottom)); return [x, y, X - x, Y - y]; })()`, tall: true },
  { name: "find", size: [1180, 760], url: (t) => `${a}?run=complydoc.json&theme=${t}#find`, find: "GB82 WEST 1234 5698 7654 32",
    clip: `(() => { const form = document.querySelector("main form") || document.querySelector("main input").parentElement; const top = form.getBoundingClientRect(); const kids = [...document.querySelectorAll("main *")].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 60 && r.height > 8 && r.top >= top.top - 1); const x = Math.min(...kids.map((r) => r.left)), X = Math.max(...kids.map((r) => r.right)), Y = Math.max(...kids.map((r) => r.bottom)); return [x, top.top, X - x, Y - top.top]; })()`, tall: true },
];
const shots = only ? all.filter((x) => only.includes(x.name)) : all;
const sizes = {};
for (const theme of ["light", "dark"]) {
  for (const shot of shots) {
    const [w, h] = shot.size;
    const b = await open(w, shot.tall ? 2400 : h, 2);
    try {
      for (const base of [a, d]) { await b.goto(base, 1200); await b.evaluate(`localStorage.setItem("complydoc.sidebar", "closed")`); }
      await b.goto("about:blank", 200); await b.goto(shot.url(theme), 4000);
      if (shot.text) {
        const tab = await b.evaluate(`(() => { const e = [...document.querySelectorAll("button,[role=tab]")].find((x) => x.innerText.trim() === "Text"); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
        if (tab) { await b.click(...tab); await sleep(1200); await b.move(5, 5); }
      }
      if (shot.find) {
        for (let i = 0; i < 20 && !(await b.evaluate(`!!document.querySelector("main input")`)); i++) await sleep(500);
        const input = await b.evaluate(`(() => { const r = document.querySelector("main input").getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]; })()`);
        await b.click(...input); await b.type(shot.find);
        const btn = await b.evaluate(`(() => { const e = document.querySelector("main form button") || [...document.querySelectorAll("main button")].find((x) => /find/i.test(x.innerText + (x.getAttribute("aria-label") || ""))); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
        await b.click(...btn); await sleep(4000); await b.evaluate(`document.activeElement && document.activeElement.blur()`); await b.move(5, 5); await sleep(300);
      }
      let params = { format: "png" };
      if (shot.clip) {
        const r = await b.evaluate(shot.clip);
        if (!r) { console.log('no clip for', shot.name, (await b.evaluate('document.querySelector("main").innerText')).slice(0, 200)); continue; }
        const pad = 12;
        params.clip = { x: Math.max(0, r[0] - pad), y: Math.max(0, r[1] - pad), width: r[2] + 2 * pad, height: r[3] + 2 * pad, scale: 1 };
        sizes[shot.name] = [Math.round(params.clip.width), Math.round(params.clip.height)];
      } else sizes[shot.name] = shot.size;
      const png = await b.send("Page.captureScreenshot", params);
      writeFileSync(`${out}/${shot.name}-${theme}.png`, Buffer.from(png.result.data, "base64"));
    } finally { b.close(); }
  }
}
console.log(JSON.stringify(sizes));
