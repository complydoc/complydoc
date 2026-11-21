// The documentation site. Its pages are made from docs/ by src/scripts/build_docs.py,
// which inlines the tested examples and generates the reference from the code; nothing
// under src/content/docs is written by hand.
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://complydoc.io",
  base: "/docs",
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "complydoc",
      description:
        "Compare loaders, trace every step and evaluate what reaches your model. Catch hidden text and personal data, and gate it in CI.",
      logo: { light: "./public/mark.svg", dark: "./public/mark-dark.svg", alt: "complydoc" },
      favicon: "/favicon.svg",
      // Visits are counted without cookies and nothing is stored in the browser.
      head: [
        {
          tag: "script",
          attrs: { "data-goatcounter": "https://complydoc.goatcounter.com/count", async: true, src: "https://gc.zgo.at/count.js" },
        },
        // The card a shared docs link shows. Same image as the landing page, served from the site root.
        {
          tag: "meta",
          attrs: { property: "og:image", content: "https://complydoc.io/og.png" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: "https://complydoc.io/og.png" },
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
        styleOverrides: {
          borderRadius: "0.6rem",
          codePaddingInline: "1.25rem",
          codePaddingBlock: "1rem",
          uiPaddingInline: "1.25rem",
          codeFontFamily: "'Geist Mono Variable', ui-monospace, monospace",
        },
      },
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Observe",
          items: [
            "guides/observe-a-pipeline",
            "guides/langfuse-phoenix",
            "guides/java",
            "guides/viewer",
            "guides/inspect-a-loader",
            "guides/compare-loaders",
            "guides/inspect-chunks",
            "guides/evals",
            "guides/find-a-value",
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
          items: ["guides/assistant-mcp", "guides/mcp/claude-desktop", "guides/mcp/claude-code", "guides/mcp/codex", "guides/mcp/cursor", "guides/mcp/vscode-copilot", "guides/gateway", "guides/ignore-findings", "guides/categories", "guides/custom-concepts", "guides/name-detection-models", "guides/decision-model", "guides/assist"],
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
            "explanation/pdf-loaders",
            "explanation/accuracy",
          ],
        },
      ],
    }),
  ],
});
