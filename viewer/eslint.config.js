import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // components/ui is shadcn's generated source: updated with its CLI, not linted by hand.
  { ignores: ["dist", "coverage", "src/components/ui"] },
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
