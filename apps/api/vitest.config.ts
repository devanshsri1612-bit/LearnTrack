import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@learntrack/contracts": path.resolve(
        __dirname,
        "../../packages/contracts/src/index.ts"
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
  },
});

