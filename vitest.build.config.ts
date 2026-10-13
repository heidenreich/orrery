import { defineConfig } from 'vitest/config';

// Checks a finished build in build/ (run after `npm run build`), without a browser.
export default defineConfig({
  test: { include: ['tests/build/**/*.test.ts'] }
});
