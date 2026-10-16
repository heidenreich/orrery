import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      // Fully static output: the site is plain files, deployable to GitHub Pages.
      adapter: adapter({ fallback: '404.html' }),
      // A base path, such as "/orrery" on GitHub Pages, or none.
      paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` },
      // Kit 3 replaces $lib with #lib subpath imports, which TypeScript 6 can't resolve without file
      // extensions; this keeps $lib working until then.
      alias: { $lib: 'src/lib' }
    })
  ],
  test: { include: ['src/**/*.test.ts'] }
});
