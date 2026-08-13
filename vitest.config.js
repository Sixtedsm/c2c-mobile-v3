// Vitest config for the V3-specific test suite (Lot 0 §3.6). Kept
// separate from vue.config.js on purpose: Vitest doesn't need the whole
// Vue CLI 5 / webpack pipeline for these tests — they exercise pure
// modules (regex parsers, geo math, offline-store I/O against
// idb-keyval's in-memory shim). The `@` alias mirrors vue.config.js so
// imports are identical to production code.
import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    globals: false,
    // Fail fast on unhandled rejections — silent test-time failures
    // are exactly what CDC §3.6 wants us to catch.
    dangerouslyIgnoreUnhandledErrors: false,
  },
});
