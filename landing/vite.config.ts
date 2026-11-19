import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "./",
  // The landing page and a page in a folder of its own for each of the others.
  build: isSsrBuild ? {} : {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        contributors: path.resolve(import.meta.dirname, "contributors/index.html"),
        router: path.resolve(import.meta.dirname, "router/index.html"),
        gateway: path.resolve(import.meta.dirname, "gateway/index.html"),
      },
    },
  },
  // The server build only renders the pages' HTML; its asset addresses are made relative
  // to each page by scripts/prerender.mjs.
  ...(isSsrBuild && {
    experimental: { renderBuiltUrl: (file: string) => `__BASE__/${file}` },
  }),
}));
