import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The industry pages, each in industries/<slug>/ (src/pages/industries.ts). */
const INDUSTRIES = ["legal", "healthcare", "finance", "insurance", "hr"];

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "./",
  // The landing page and a page in a folder of its own for each of the others.
  build: isSsrBuild ? {} : {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        enterprise: path.resolve(import.meta.dirname, "enterprise/index.html"),
        contributors: path.resolve(import.meta.dirname, "contributors/index.html"),
        veil: path.resolve(import.meta.dirname, "veil/index.html"),
        gateway: path.resolve(import.meta.dirname, "gateway/index.html"),
        ...Object.fromEntries(
          INDUSTRIES.map((slug) => [`industry-${slug}`, path.resolve(import.meta.dirname, `industries/${slug}/index.html`)]),
        ),
      },
    },
  },
  // The server build only renders the pages' HTML; its asset addresses are made relative
  // to each page by scripts/prerender.mjs.
  ...(isSsrBuild && {
    experimental: { renderBuiltUrl: (file: string) => `__BASE__/${file}` },
  }),
}));
