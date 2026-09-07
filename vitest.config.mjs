import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },
});
