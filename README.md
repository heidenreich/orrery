# Orrery

An interactive 3D solar system with planet weather, starting with the latest
report from NASA's Curiosity rover.

Planet positions are computed for any date from JPL's
[approximate orbital elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html)
(accurate for 1800–2050). Select a planet to see its distance from Earth, signal
delay, and what its weather is like.

It grew out of [heidenreich/mars](https://github.com/heidenreich/mars), a 2014
Mars weather page.

## Develop

```sh
npm install   # needs npm 11+, see below
npm run dev
```

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Start the dev server                                |
| `npm run build`    | Build the static site into `build/`                 |
| `npm run preview`  | Serve the production build locally                  |
| `npm run check`    | Type-check the Svelte and TypeScript code           |
| `npm test`         | Run the unit tests                                  |
| `npm run test:e2e` | Build, serve and smoke-test the site in Chromium    |

Run `npx playwright install chromium` once before the first `test:e2e`.

The npm 10.9 bundled with Node 22 crashes on this dependency tree, so
`package.json` requires npm 11 and `.npmrc` makes npm 10 stop with an
`EBADENGINE` message instead. Use `npx npm@11 install`, or
`npm install -g npm@11`.

## Deploy

`.github/workflows/ci.yml` runs the type-check, unit tests and browser smoke
tests on every pull request and every push to `main`. Pushes to `main` also
deploy the site to GitHub Pages at https://heidenreich.github.io/orrery/.
Pages must be set to deploy from GitHub Actions (Settings → Pages → Source).

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) with `adapter-static`: the
  site builds to plain files. CI sets `BASE_PATH` from the Pages configuration.
- [three.js](https://threejs.org) for the 3D scene, loaded only in the browser.
- [Vitest](https://vitest.dev) for unit tests, [Playwright](https://playwright.dev)
  for browser smoke tests (`tests/e2e`).

## Layout

```
src/
  lib/orrery/orbits.ts      Orbital math: positions, orbit paths, Mars Sol Date
  lib/orrery/bodies.ts      Planet data: orbital elements, sizes, weather facts
  lib/orrery/scene.ts       three.js scene, camera and labels (no UI framework code)
  lib/orrery/textures.ts    Procedural planet, ring and glow textures
  lib/data/rems.ts          Parser for NASA's REMS feed
  lib/data/weather.ts       Live fetch with console logging and fallback
  lib/data/mars-report.ts   Report type and the stored fallback report
  lib/components/           Orrery canvas and info panel
  routes/+page.svelte       The page: header, clock, controls
tests/e2e/                  Browser smoke tests
```

## Data

The Mars weather comes from NASA's REMS feed for Curiosity:
`https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`.
It is undocumented, its values are strings (`"--"` when a reading is missing),
and it lags a few weeks behind.

The page fetches the feed in the browser on load. If the request fails (network,
CORS, timeout, bad data), it shows the stored report in
`src/lib/data/mars-report.ts` and says so in the panel.

Every step is logged to the browser console with a `[weather]` prefix: the
request, HTTP status and headers, the newest raw entry, skipped entries,
missing readings, and the reason for any fallback. Filter the console on
`[weather]` to see them.

Still unverified: whether NASA allows the cross-site request (CORS), and the
names of fields beyond sol, date, `ls` and `season`. The sample in
`src/lib/data/fixtures/rems-sample.json` is constructed, not recorded; replace
it with a real response once one is captured.

Next: a scheduled GitHub Action that writes the latest report to
`static/weather.json`, so the fallback stays current. NOAA's space weather feed
(`services.swpc.noaa.gov`) is a candidate second source.
