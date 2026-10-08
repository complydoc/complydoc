// The documentation site. Its pages are made from docs/ by src/scripts/build_docs.py,
// which inlines the tested examples and generates the reference from the code; nothing
// under src/content/docs is written by hand.
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://complydoc.github.io",
  base: "/complydoc/docs",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "complydoc",
      description: "The observability layer for AI ingestion pipelines.",
      logo: { light: "./public/mark.svg", dark: "./public/mark-dark.svg", alt: "complydoc" },
      favicon: "/favicon.svg",
      // Visits are counted without cookies and nothing is stored in the browser.
      head: [
        {
          tag: "script",
          attrs: { "data-goatcounter": "https://complydoc.goatcounter.com/count", async: true, src: "https://gc.zgo.at/count.js" },
        },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/complydoc/complydoc" }],
      editLink: { baseUrl: "https://github.com/complydoc/complydoc/edit/main/docs/" },
      customCss: [
        "@fontsource-variable/geist",
        "@fontsource-variable/geist-mono",
        "./src/styles/complydoc.css",
      ],
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        styleOverrides: { borderRadius: "0.6rem", codeFontFamily: "'Geist Mono Variable', ui-monospace, monospace" },
      },
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Observe",
          items: [
            "guides/observe-a-pipeline",
            "guides/viewer",
            "guides/inspect-a-loader",
            "guides/compare-loaders",
            "guides/inspect-chunks",
            "guides/replace-langchain-community",
          ],
        },
        {
          label: "Audit",
          items: [
            "guides/audit-a-folder",
            "guides/routing",
            "guides/verify-with-vision",
            "guides/extract-masked-text",
            "guides/report-tables",
            "guides/clean",
          ],
        },
        {
          label: "Security",
          items: ["guides/ignore-findings", "guides/categories", "guides/custom-concepts", "guides/name-detection-models", "guides/assist"],
        },
        {
          label: "CI and code",
          items: [
            "guides/python-api",
            "guides/streaming-and-steps",
            "guides/baselines-and-tests",
            "guides/policy",
            "guides/github-action",
            "guides/container",
            "guides/team",
          ],
        },
        {
          label: "Reference",
          items: ["reference/cli", "reference/api", "reference/report", "reference/configuration", "reference/identifiers"],
        },
        {
          label: "How it works",
          collapsed: true,
          items: [
            "explanation/offline",
            "explanation/not-measured",
            "explanation/evidence",
            "explanation/hidden-content",
            "explanation/accuracy",
          ],
        },
      ],
    }),
  ],
});
