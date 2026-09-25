import type { HighlighterCore } from "shiki/core";

export type Lang = "python" | "bash" | "yaml" | "text";

let highlighter: Promise<HighlighterCore> | null = null;

/**
 * Shiki, loaded once and only with the three grammars this page shows, on the
 * JavaScript regex engine so there is no WebAssembly to fetch. The theme writes
 * CSS variables, which index.css sets from complydoc's own tokens.
 */
function load(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [createCssVariablesTheme({ name: "complydoc", variablePrefix: "--code-" })],
        langs: [import("shiki/langs/python.mjs"), import("shiki/langs/bash.mjs"), import("shiki/langs/yaml.mjs")],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}

/** The code as highlighted HTML, coloured by the complydoc theme's variables. */
export async function highlight(code: string, lang: Lang): Promise<string> {
  const shiki = await load();
  return shiki.codeToHtml(code, { lang: lang === "text" ? "text" : lang, theme: "complydoc" });
}
