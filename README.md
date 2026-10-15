# Orrery

An interactive 3D solar system with planet weather, starting with the latest
report from NASA's Curiosity rover.

Planet positions are computed for any date from 1000 to 3000 with
[Astronomy Engine](https://github.com/cosinekitty/astronomy) (VSOP87, about
1 arcminute), and orbits are drawn from JPL's
[approximate orbital elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html).
Select a planet to see its distance from Earth, signal
delay, and what its weather is like.

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
| `npm run test:build` | Check a finished build: base path, files, data |

Run `npx playwright install chromium` once before the first `test:e2e`.

The npm 10.9 bundled with Node 22 crashes on this dependency tree, so
`package.json` requires npm 11 and `.npmrc` makes npm 10 stop with an
`EBADENGINE` message instead. Use `npx npm@11 install`, or
`npm install -g npm@11`.

## Deploy

`.github/workflows/ci.yml` has three jobs:

- **test** (pull requests and pushes to `main`): type-check, unit tests, and
  browser smoke tests against an offline build.
- **build** (pushes to `main` after the tests pass, the hourly schedule, and
  manual runs): builds the real site with live data and the Pages base path,
  then runs `npm run test:build` on it, without a browser.
- **deploy**: publishes that build to https://heidenreich.github.io/orrery/.

The hourly run (at :23) only refreshes the data: it skips the test job, so a
flaky test or a failed browser install cannot stop the update. To refresh by
hand, run the CI workflow from the Actions tab. Each build's summary shows what
data it fetched. Data runs queue apart from push runs, so they never displace a
commit waiting for its tests, and a data run skips its deploy if `main` has
moved on by then (that commit's own run deploys).

Pages must be set to deploy from GitHub Actions (Settings → Pages → Source).
GitHub pauses scheduled workflows in a public repository after 60 days without
activity; re-enable it from the Actions tab if that happens.

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) with `adapter-static`: the
  site builds to plain files. CI sets `BASE_PATH` from the Pages configuration.
- [three.js](https://threejs.org) for the 3D scene, loaded only in the browser.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT) for planet
  positions.
- [Vitest](https://vitest.dev) for unit tests, [Playwright](https://playwright.dev)
  for browser smoke tests (`tests/e2e`).

## Layout

```
src/
  lib/orrery/ephemeris.ts   Planet positions (Astronomy Engine)
  lib/orrery/orbits.ts      Orbit shapes and paths (JPL mean elements), Mars Sol Date
  lib/orrery/bodies.ts      Planet data: orbital elements, sizes, weather facts
  lib/orrery/facts.ts       Mass, gravity, density, atmosphere, moons, rings, missions
  lib/orrery/scene.ts       three.js scene, camera and labels (no UI framework code)
  lib/orrery/textures.ts    Drawn planet, ring and glow textures (shown until the images load)
  lib/orrery/seasons.ts     Sunlight and seasons from each planet's orbit and pole
  lib/data/rems.ts          Parser for NASA's REMS feed
  lib/data/solar-wind.ts    Parser for NOAA's real-time solar wind feed
  lib/data/kp.ts            Parser for NOAA's planetary K-index, storm level and aurora guide
  lib/data/xray.ts          Parser for NOAA's GOES X-ray flux, flare class and radio blackout level
  lib/data/horizons.ts      JPL Horizons requests and vector-table parser
  lib/data/spacecraft-data.ts  Builds, checks and interpolates the spacecraft data file
  lib/orrery/craft.ts       The spacecraft shown, with their Horizons IDs and trajectory windows
  lib/orrery/moons.ts       The Moon, Jupiter's four large moons (Astronomy Engine), Titan and Triton (Horizons)
  lib/data/weather-data.ts  Builds the data file, with fallback to the last good copy
  lib/data/weather.ts       Loads the data file in the browser
  lib/data/fetch-json.ts    Fetch with timeout and console logging
  lib/data/mars-report.ts   Report type and the stored fallback report
  lib/components/           Orrery canvas, info panel, solar wind card
  routes/+page.svelte       The page: header, clock, controls
  routes/data/weather.json  Prerendered data file, built from NASA and NOAA
static/textures/            Planet, Moon, Sun and ring images (Solar System Scope, CC BY 4.0)
static/models/              Voyager and Parker Solar Probe models (NASA 3D Resources, no copyright)
static/draco/               three's Draco decoder for those models (npm run sync:draco after a three upgrade)
tests/e2e/                  Browser smoke tests
```

## Computed per planet

Every planet panel shows sunlight and seasons for the date on the clock, with
no data source: sunlight is 1361 W/m² divided by the square of the distance from
the Sun, and seasons come from the planet's IAU pole direction against the
direction of the Sun (solar longitude Ls and the latitude where the Sun is
overhead). Mercury, Venus and Jupiter, tilted under 5°, are shown as having
barely any seasons.

Accuracy, as checked by the unit tests:

- Mars Ls within 0.02° of the Allison & McEwen (2000) formula (341.558° on
  25 Aug 2026; Curiosity's feed rounds it to 341), and Mars's next northern
  spring equinox within an hour of that formula's date.
- Earth's 2026 equinox and solstices within about 15 minutes, and the next
  December solstice within 30 minutes.
- Axial tilts within 0.05° of published values.
- Curiosity's sol numbering exactly, counted in Gale Crater local time.

Positions come from Astronomy Engine (`src/lib/orrery/ephemeris.ts`), whose
truncated VSOP87 is checked by its author against NOVAS and JPL Horizons to
about 1 arcminute; VSOP87 holds for thousands of years around 2000. The tests
check it against Earth's 2026 perihelion and aphelion, the January 2025 Mars
close approach, and the Mars, Jupiter and Saturn oppositions of 2025–26.
The orbit lines use JPL's mean elements (fitted for 1800–2050); over the
page's whole range, 1000 to 3000, the planets stay within 0.03° of their drawn
orbit plane and 0.6% of its distance range. Playback stops at those years.

## Data

The browser loads two files built with the site: `data/weather.json` (a few KB)
and, for the 3D view, `data/spacecraft.json` (tens of KB). The browser never
contacts NASA, NOAA or JPL.

| Source | URL | Size | Kept |
| --- | --- | --- | --- |
| Curiosity REMS weather | `mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json` | ~2 MB, whole mission | Newest report, last 60 sols |
| NOAA real-time solar wind | `services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json` | ~2.6 MB, 1-minute records | Newest reading, last 24 h at 10-minute steps |
| NOAA GOES X-ray flux | `services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json` | ~1 MB, 1-minute records, two channels | Newest 0.1–0.8 nm reading, 24 h peak, 24 h at 10-minute steps |
| JPL Horizons spacecraft trajectories | `ssd.jpl.nasa.gov/api/horizons.api` | one request per spacecraft | Position and velocity at even steps, written to `data/spacecraft.json` |
| NOAA planetary K-index (Kp) | `services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | small, 3-hourly for about a week | Newest value, last 3 days |

At build time `src/routes/data/weather.json/+server.ts` fetches both feeds and
writes the file. When a feed fails, the build reuses that part of the live
site's current file (`PREVIOUS_DATA_URL`, set by CI), so an outage keeps the last
good data instead of replacing it. With no previous copy, the Mars panel shows
the stored report in `src/lib/data/mars-report.ts` and the solar wind is hidden.
Set `ORRERY_OFFLINE=1` to build without any network requests.

Logging: the build logs under `[rems]`, `[solar-wind]`, `[xray]`, `[kp]`, `[craft]` and `[data]` (visible in
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

## Images

The Sun, planet, Moon and Saturn ring images in `static/textures/` are from
[Solar System Scope](https://www.solarsystemscope.com/textures/), based on NASA
imagery, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
and credited in the page's overview panel. They came via the Qt 3D project's
copy, were converted to WebP, and the ring image was cropped to one of its two
identical halves (`static/textures/LICENSE.txt`). About 800 KB in all, loaded
after the scene appears; until then, or if one fails, the drawn textures in
`textures.ts` stay. Venus keeps its drawn cloud texture, since the only Venus
map shows the radar-mapped surface beneath the clouds.

## Spacecraft models

Voyager (used for both probes) and Parker Solar Probe are NASA's own models from
[NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), which describes
them as free and without copyright (`static/models/LICENSE.txt`). They load only
when one of those spacecraft is selected, with three's Draco decoder copied into
`static/draco/`; a unit test fails if that copy no longer matches the installed
three, and `npm run sync:draco` refreshes it. The models are drawn far larger
than life and pointed as the real ones are: Voyager's dish at Earth, Parker's
heat shield at the Sun. New Horizons, Europa Clipper and JUICE have no glTF
model there, so they keep their markers.

## Licence

The code is under the MIT licence (`LICENSE`). The images in `static/textures/`
are CC BY 4.0 (see Images above), and Astronomy Engine is MIT.
