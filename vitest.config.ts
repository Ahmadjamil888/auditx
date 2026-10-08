import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals:     true,
    // Only run pure-logic tests — anything that imports Supabase is excluded
    // here because those require a running database. Use `vitest --run` for CI.
    include: [
      "src/lib/policy-engine.test.ts",
      "src/lib/model-routing.test.ts",
      "src/lib/schema-validator.test.ts",
      "src/lib/invariant-checks.test.ts",
      "src/lib/agent-queue.test.ts",
      "src/lib/tax.test.ts",
      "src/lib/policy-learner.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include:  ["src/lib/policy-engine.ts", "src/lib/tax.ts", "src/lib/schema-validator.ts"],
    },
  },
});
