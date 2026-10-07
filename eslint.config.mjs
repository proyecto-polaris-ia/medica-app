import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Los parámetros con prefijo `_` son convención de "intencionalmente
      // sin uso" (firmas de mocks, handlers tipados); no reportarlos.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      // Next.js build output:
      ".next/**",
      "out/**",
      "next-env.d.ts",
      // Nitro/eve build output and vendored runtime snapshots:
      ".output/**",
      ".eve/**",
      // Tool caches and vendored files:
      "node_modules/**",
      ".vercel/**",
      "coverage/**",
      "*.tsbuildinfo",
    ],
  },
];

export default eslintConfig;
