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

The same workflow also runs every hour (at :17) to rebuild the site with fresh
NASA and NOAA data; see [Data](#data). Each run's summary shows what it fetched.
GitHub pauses scheduled workflows in a public repository after 60 days without
activity; re-enable it from the Actions tab if that happens.

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
  lib/data/solar-wind.ts    Parser for NOAA's real-time solar wind feed
  lib/data/weather-data.ts  Builds the data file, with fallback to the last good copy
  lib/data/weather.ts       Loads the data file in the browser
  lib/data/fetch-json.ts    Fetch with timeout and console logging
  lib/data/mars-report.ts   Report type and the stored fallback report
  lib/components/           Orrery canvas, info panel, solar wind card
  routes/+page.svelte       The page: header, clock, controls
  routes/data/weather.json  Prerendered data file, built from NASA and NOAA
tests/e2e/                  Browser smoke tests
```

## Data

The browser loads one small file, `data/weather.json` (a few KB), built when
the site is built. The browser never contacts NASA or NOAA.

| Source | URL | Size | Kept |
| --- | --- | --- | --- |
| Curiosity REMS weather | `mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` | ~2 MB, whole mission | Newest report, last 60 sols |
| NOAA real-time solar wind | `services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json` | ~2.6 MB, 1-minute records | Newest reading, last 24 h at 10-minute steps |

At build time `src/routes/data/weather.json/+server.ts` fetches both feeds and
writes the file. When a feed fails, the build reuses that part of the live
site's current file (`PREVIOUS_DATA_URL`, set by CI), so an outage keeps the last
good data instead of replacing it. With no previous copy, the Mars panel shows
the stored report in `src/lib/data/mars-report.ts` and the solar wind is hidden.
Set `ORRERY_OFFLINE=1` to build without any network requests.

Logging: the build logs under `[rems]`, `[solar-wind]` and `[data]` (visible in
the CI log), and the browser logs loading the file under `[weather]`.

Notes on the feeds (checked 2026-10-13):

- REMS values are strings, `"--"` when a reading is missing, and the newest sol
  lags a few weeks behind. Field names match the parser.
- The solar wind feed interleaves records from several spacecraft, each with
  `source` and `active`. On 2026-10-13 it held SOLAR1 (1165 records, all
  active), ACE (1217) and IMAP (1209, both inactive), so the parser uses only
  active records, or every source if none is active. It logs counts per source
  on each build in case NOAA changes this.
- `src/lib/data/fixtures/` holds the real newest REMS entry and two real solar
  wind records; the rest of each sample is constructed for tests.
