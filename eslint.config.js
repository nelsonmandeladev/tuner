// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist", "**/node_modules", "**/src-tauri/target", "**/src-tauri/gen"]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["apps/desktop/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // The core must stay portable (CLAUDE.md rule 7): no React, no Tauri, and no
    // Node built-ins outside tests (a React Native build supplies its own adapters).
    files: ["packages/core/**/*.ts"],
    ignores: ["packages/core/test/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["react", "react-*", "@tauri-apps/*", "node:*"] },
      ],
    },
  },
  {
    // Rule 6: only the adapters in src/data reach the network and the databases.
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    ignores: ["apps/desktop/src/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/plugin-http", "@tauri-apps/plugin-sql"],
              message: "Go through the adapters in src/data and the stores built on them.",
            },
          ],
        },
      ],
    },
  },
  {
    // UI never fetches (CLAUDE.md rule 6): only packages/core talks to the provider.
    files: ["apps/desktop/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Screens read stores; provider calls go through packages/core." },
      ],
    },
  },
  prettier,
]);
