import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // shadcn's generated source, updated with its CLI rather than by hand, is not linted.
  { ignores: ["dist", "coverage", "src/components/ui", "src/hooks/use-mobile.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // The house rule: split a component before it reaches 300 lines.
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
);
