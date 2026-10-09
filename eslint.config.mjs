import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "work/**", "public/**"] },
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/App.jsx", "src/main.jsx"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },
);
