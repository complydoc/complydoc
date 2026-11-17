// Put each page's HTML into its file in dist/, rendered from the server build in dist-ssr/.
// Asset addresses come out of the server build as `__BASE__/assets/...` and are made
// relative to the page here: `./` for the landing page, `../` for one in a folder.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const { render, files } = await import(pathToFileURL(path.join(root, "dist-ssr/prerender.js")).href);

for (const file of files) {
  const target = path.join(root, "dist", file);
  const base = file.includes("/") ? ".." : ".";
  const html = render(file).replaceAll("__BASE__", base);
  const page = readFileSync(target, "utf8");
  if (!page.includes('<div id="root"></div>')) throw new Error(`${file} has no empty #root`);
  writeFileSync(target, page.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
  console.log(`prerendered ${file} (${Math.round(html.length / 1024)} kB)`);
}
rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });
