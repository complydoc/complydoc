// The recordings on the landing page, one scene each.
//   node scenes.mjs <viewer url on the sample audit and runs> <viewer url on a loader comparison> <out dir> <find|diff> <light|dark>
import { centre, film } from "./film.mjs";
const [A, L, out, scene, theme] = process.argv.slice(2);
// A short label on the page, by where it is: the lowest one, or the leftmost.
const label = (text, pick) => `(() => { const all = [...document.querySelectorAll("body *")].filter((e) => { if (e.closest("#__cursor")) return false; const t = (e.innerText || "").trim(); return t.startsWith(${JSON.stringify(text)}) && t.length < 60 && e.getClientRects().length; }); if (!all.length) return null; const box = (e) => e.getBoundingClientRect(); all.sort((x, y) => ${pick === "lowest" ? "box(y).y - box(x).y" : "box(x).x - box(y).x"} || box(x).width * box(x).height - box(y).width * box(y).height); const r = box(all[0]); return [r.x, r.y, r.width, r.height]; })()`;


const scenes = {
  /** Find a value: typed, searched, then the run that stopped it and the run that sent it, each whole. */
  async find(f) {
    await f.goto(`${A}?run=complydoc.json&theme=${theme}#find`);
    await f.snap(); f.hold(18);
    const input = await f.css("main input");
    const typing = f.camera([input[0] - 16, input[1] - 40, 700, 300], 0);
    await f.glide([input[0] + 90, input[1] + input[3] / 2], 24, typing);
    await f.click(2);
    await f.type("GB82 WEST 1234 5698 7654 32");
    f.hold(10);
    const button = (await f.css("main form button")) ?? (await f.rect("Find", "button"));
    await f.glide(centre(button), 14);
    await f.click(10, 110);
    // Back out as the answer arrives.
    for (let i = 0; i < 14; i++) { await f.snap(); }
    f.pan(f.full, 26); f.hold(34);
    const stopped = await f.rect("Stopped after");
    const sent = await f.eval(label("Sent to localhost", "leftmost"));
    const card = (mark) => `(() => { const all = [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.top <= ${mark[1]} && r.bottom >= ${mark[1] + mark[3]} && r.width > 500 && r.height > 120 && r.height < 420; }); all.sort((x, y) => x.getBoundingClientRect().height - y.getBoundingClientRect().height); if (!all.length) return null; const r = all[0].getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`;
    const first = (await f.eval(card(stopped))) ?? [input[0], stopped[1] - 30, 900, 260];
    const second = (await f.eval(card(sent))) ?? [input[0], sent[1] - 30, 900, 240];
    await f.glide([stopped[0] + 40, stopped[1] + stopped[3] / 2], 26, f.camera(first, 26));
    f.hold(70);
    await f.glide([sent[0] + 30, sent[1] + sent[3] / 2], 28, f.camera(second, 26));
    f.hold(70);
    f.pan(f.full, 26); f.hold(16);
  },
  /** Compare: two loaders on a two-column page, where one reads straight across the columns. */
  async diff(f) {
    await f.goto(`${L}?run=complydoc-loaders.json&theme=${theme}#documents/0`);
    await f.snap(); f.hold(22);
    const page = await f.eval(`(() => { const e = [...document.querySelectorAll("main button, main a, main li")].find((x) => x.innerText.trim() === "Page 6"); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
    await f.glide(centre(page), 24);
    await f.click(16, 90);
    f.hold(16);
    const table = await f.css("table.diff-table");
    const top = (await f.rect("# Page 6"))?.[1] ?? table[1];
    const half = table[2] / 2;
    const kept = f.camera([table[0], top - 8, half, 210], 6, 520);
    const other = f.camera([table[0] + half, top - 8, half, 210], 6, 520);
    await f.glide([table[0] + half * 0.55, top + 60], 26, kept);
    f.hold(64);
    await f.glide([table[0] + half * 1.5, top + 60], 30, other);
    f.hold(84);
    f.pan(f.full, 28); f.hold(16);
  },
};
const f = await film([A, L], out, theme, 1120);
try { await scenes[scene](f); console.log(scene, theme, JSON.stringify(f.finish())); } catch (error) { f.close(); throw error; }
