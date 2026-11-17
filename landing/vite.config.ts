import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "./",
  // The landing page and a page in a folder of its own for each of the others.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        enterprise: path.resolve(import.meta.dirname, "enterprise/index.html"),
        contributors: path.resolve(import.meta.dirname, "contributors/index.html"),
      },
    },
  },
});
