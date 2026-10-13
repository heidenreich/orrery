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

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start the dev server                      |
| `npm run build`   | Build the static site into `build/`       |
| `npm run preview` | Serve the production build locally        |
| `npm run check`   | Type-check the Svelte and TypeScript code |
| `npm test`        | Run the unit tests                        |

The npm 10.9 bundled with Node 22 crashes on this dependency tree
(`Cannot read properties of null (reading 'edgesOut')`). Use npm 11:
`npx npm@11 install`, or `npm install -g npm@11`.

## Stack

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) with `adapter-static`: the
  site builds to plain files, ready for GitHub Pages. Set `BASE_PATH=/orrery` when
  building for a project page.
- [three.js](https://threejs.org) for the 3D scene, loaded only in the browser.
- [Vitest](https://vitest.dev) for unit tests.

## Layout

```
src/
  lib/orrery/orbits.ts      Orbital math: positions, orbit paths, Mars Sol Date
  lib/orrery/bodies.ts      Planet data: orbital elements, sizes, weather facts
  lib/orrery/scene.ts       three.js scene, camera and labels (no UI framework code)
  lib/orrery/textures.ts    Procedural planet, ring and glow textures
  lib/data/mars-report.ts   Latest Curiosity report (placeholder, see below)
  lib/components/           Orrery canvas and info panel
  routes/+page.svelte       The page: header, clock, controls
```

## Data

The Mars weather comes from NASA's REMS feed for Curiosity:
`https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json`.
It is undocumented, its values are strings, and it lags a few weeks behind.
For now `src/lib/data/mars-report.ts` holds the latest entry by hand.

Planned next step: a scheduled GitHub Action that fetches the feed, validates
it, and writes `static/weather.json`, so the site stays current and keeps the
last good report when NASA's feed is down. NOAA's space weather feed
(`services.swpc.noaa.gov`) is a candidate second source.
