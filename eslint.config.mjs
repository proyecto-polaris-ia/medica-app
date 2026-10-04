import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
