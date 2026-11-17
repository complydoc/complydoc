import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * `COMPLYDOC_UI=http://127.0.0.1:8500 npm run dev` works on the reports a running
 * `complydoc ui` serves, with saving too: its API is passed through, and the page
 * is told to load from it, as `complydoc ui` tells the page it serves itself.
 * Without the variable, the dev server opens reports from files, as it always has.
 */
const ui = process.env.COMPLYDOC_UI?.replace(/\/$/, "");

function localReports(target: string): Plugin {
  const fallback = { reports: "api/reports", sources: [target] };
  // complydoc ui's own page says what it offers, uploads among them; read it there, so the
  // dev server offers the same, and fall back to its reports alone if it cannot be read.
  const config = async () => {
    try {
      const page = await (await fetch(`${target}/`)).text();
      const found = /<script[^>]*id="complydoc-local"[^>]*>([\s\S]*?)<\/script>/.exec(page)?.[1];
      if (found) return { ...(JSON.parse(found) as object), sources: [target] };
    } catch {
      // Not running yet: the reports alone.
    }
    return fallback;
  };
  return {
    name: "complydoc-ui-reports",
    apply: "serve",
    transformIndexHtml: async (html) => {
      const text = JSON.stringify(await config()).replace(/</g, "\\u003c");
      return html.replace("</head>", `  <script type="application/json" id="complydoc-local">${text}</script>\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(ui ? [localReports(ui)] : [])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Relative asset paths, so the built viewer opens from disk as well as from a server.
  base: "./",
  server: ui
    ? {
        proxy: {
          "/api": {
            target: ui,
            changeOrigin: true,
            // complydoc ui takes changes only from its own page. Passed through this dev
            // server, a change comes from here, so it is sent as coming from there.
            headers: { origin: ui },
          },
        },
      }
    : {},
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
