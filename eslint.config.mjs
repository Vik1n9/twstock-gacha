import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // vinext / Cloudflare 建置輸出
    "dist/**",
    ".vinext/**",
    // wrangler types 產生（npm run cf-typegen）
    "worker-configuration.d.ts",
  ]),
]);

export default eslintConfig;
