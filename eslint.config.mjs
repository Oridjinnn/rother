import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { fileURLToPath } from "url";

fileURLToPath(import.meta.url);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  ignores: ["node_modules/**", ".next/**", "out/**", "next-env.d.ts", "examples/**", "skills", "tool-results/**", "src-tauri/target/**", "src-tauri/frontend-dist/**"],
}];

export default eslintConfig;
