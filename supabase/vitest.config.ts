import { defineConfig } from 'vitest/config';

// Each test file boots its own in-process Postgres (PGlite) and applies every migration,
// which takes several seconds when files run in parallel.
export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
