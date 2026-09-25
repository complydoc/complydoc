import type { HighlighterCore } from "shiki/core";

export type Lang = "python" | "bash" | "yaml" | "text";

let highlighter: Promise<HighlighterCore> | null = null;

/**
 * Shiki, loaded once and only with the three grammars this page shows, on the
 * JavaScript regex engine so there is no WebAssembly to fetch.
 */
function load(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
    createHighlighterCore({
      themes: [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
      langs: [import("shiki/langs/python.mjs"), import("shiki/langs/bash.mjs"), import("shiki/langs/yaml.mjs")],
      engine: createJavaScriptRegexEngine(),
    }),
  );
  return highlighter;
}

/** The code as highlighted HTML, with both themes' colours as CSS variables (index.css picks one). */
export async function highlight(code: string, lang: Lang): Promise<string> {
  const shiki = await load();
  return shiki.codeToHtml(code, {
    lang: lang === "text" ? "text" : lang,
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });
}
