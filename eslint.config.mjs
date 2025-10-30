import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

const typeScriptConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts", "**/*.tsx"],
  ignores: ["packages/web/**"],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: ["./tsconfig.json"],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    ...config.rules,
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", ignoreRestSiblings: true },
    ],
  },
}));

export default [
  {
    ignores: [
      "**/node_modules/**",
      ".next/**",
      ".sst/**",
      "packages/web/.next/**",
      "packages/web/out/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      sourceType: "module",
    },
  },
  ...typeScriptConfigs,
  prettier,
];
