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
  const config = JSON.stringify({ reports: "api/reports", sources: [target] }).replace(/</g, "\\u003c");
  return {
    name: "complydoc-ui-reports",
    apply: "serve",
    transformIndexHtml: (html) =>
      html.replace("</head>", `  <script type="application/json" id="complydoc-local">${config}</script>\n  </head>`),
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
