import js from "@eslint/js";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".wxt/**",
      ".output/**",
      "node_modules/**",
      "public/**",
      "eslint.config.js",
      "vitest.config.ts",
      "wxt.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  jsdoc.configs["flat/recommended-typescript"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
          contexts: [
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
          ],
        },
      ],
      "jsdoc/require-param": ["warn", { checkDestructured: false }],
      "jsdoc/check-param-names": ["warn", { checkDestructured: false }],
      "jsdoc/tag-lines": ["warn", "any", { startLines: 1 }],
      "jsdoc/require-returns": "off",
      "jsdoc/check-tag-names": ["warn", { definedTags: ["module"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
