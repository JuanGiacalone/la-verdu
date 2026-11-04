import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one database and reset its schema, so files run one at a time.
    fileParallelism: false,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
