import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { planetPosition } from '../../src/lib/orrery/ephemeris';

const DATA = '**/data/weather.json';
const sampleFile = readFileSync(new URL('./weather-sample.json', import.meta.url), 'utf8');

/** The sample data with its timestamps shifted so the newest solar wind reading is `ageMinutes` old. */
function sampleAged(ageMinutes = 5): string {
  const d = JSON.parse(sampleFile);
  const shift = Date.now() - ageMinutes * 60_000 - Date.parse(d.solarWind.summary.latest.time);
  const move = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  d.generatedAt = move(d.generatedAt);
  d.mars.fetchedAt = move(d.mars.fetchedAt);
  d.solarWind.fetchedAt = move(d.solarWind.fetchedAt);
  d.solarWind.summary.latest.time = move(d.solarWind.summary.latest.time);
  for (const p of d.solarWind.summary.series) p.time = move(p.time);
  d.kp.fetchedAt = move(d.kp.fetchedAt);
  d.kp.summary.latest.time = move(d.kp.summary.latest.time);
  for (const p of d.kp.summary.series) p.time = move(p.time);
  d.xray.fetchedAt = move(d.xray.fetchedAt);
  d.xray.summary.latest.time = move(d.xray.summary.latest.time);
  d.xray.summary.peak.time = move(d.xray.summary.peak.time);
  for (const p of d.xray.summary.series) p.time = move(p.time);
  return JSON.stringify(d);
}
const sample = sampleAged();

// Constructed spacecraft tracks around today (not real trajectories): Voyager 1 coasting outward
// at 170 AU, 16.9 km/s, and Parker on a 0.2 AU circle. Sampled evenly, as the real file is.
function craftSample(): string {
  const DAY = 86_400_000;
  const start = Date.now() - 400 * DAY;
  const v1 = { p: [] as number[], v: [] as number[] };
  for (let i = 0; i <= 14; i++) {
    const d = i * 60, vx = 0.0098; // AU/day
    v1.p.push(-50 + vx * d * 0.3, 160 + vx * d * 0.9, 30 + vx * d * 0.3);
    v1.v.push(vx * 0.3, vx * 0.9, vx * 0.3);
  }
  const parker = { p: [] as number[], v: [] as number[] };
  const w = (2 * Math.PI) / 30; // one turn in 30 days
  for (let i = 0; i <= 40; i++) {
    const a = w * i;
    parker.p.push(0.2 * Math.cos(a), 0.2 * Math.sin(a), 0);
    parker.v.push(-0.2 * w * Math.sin(a), 0.2 * w * Math.cos(a), 0);
  }
  const fetchedAt = new Date().toISOString();
  return JSON.stringify({
    version: 1,
    generatedAt: fetchedAt,
    craft: [
      { id: 'voyager-1', source: 'live', fetchedAt, start: new Date(start).toISOString(), stepMs: 60 * DAY, ...v1 },
      { id: 'parker', source: 'live', fetchedAt, start: new Date(Date.now() - 20 * DAY).toISOString(), stepMs: DAY, ...parker }
    ],
    missing: []
  });
}
const CRAFT_DATA = '**/data/spacecraft.json';

// Serve a known data file (the test build skips the network), and record any request to the
// upstream feeds: the browser should never call NASA or NOAA itself.
let upstream: string[] = [];
test.beforeEach(async ({ page }) => {
  upstream = [];
  page.on('request', (r) => /mars\.nasa\.gov|swpc\.noaa\.gov/.test(r.url()) && upstream.push(r.url()));
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: sample }));
  await page.route(CRAFT_DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: craftSample() }));
});

// Fail the test on any console error or uncaught exception.
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const panel = (page: Page) => page.locator('aside.panel');
/** The 3D scene's planet labels (the overview table has buttons with the same names). */
const labels = (page: Page) => page.locator('.labels');
const select = (page: Page, name: string) =>
  // Labels move every frame and hide when off screen (e.g. after zooming to another planet),
  // so find them even when hidden and click through the DOM.
  labels(page).getByRole('button', { name, exact: true, includeHidden: true }).evaluate((el: HTMLElement) => el.click());

test('renders the solar system and opens the Mars panel', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  await expect(page.locator('.stage canvas')).toBeVisible();
  await expect(labels(page).getByRole('button', { name: 'Sun', exact: true })).toBeVisible();
  await expect(panel(page)).toContainText('From Earth');

  await select(page, 'Mars');
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  await expect(panel(page)).toContainText('Curiosity weather report');
  await expect(panel(page)).toContainText('Radio signal takes');

  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('heading', { name: 'Pick a world' })).toBeVisible();

  expect(errors).toEqual([]);
  expect(upstream).toEqual([]);
});

test('shows Mars weather from the data file and logs it', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => m.text().startsWith('[weather]') && logs.push(m.text()));
  await page.goto('/');
  await select(page, 'Mars');

  await expect(page.getByTestId('weather-source')).toContainText("From NASA's REMS feed, checked just now.");
  await expect(panel(page)).toContainText('−71 °C to −5 °C');
  await expect(panel(page)).toContainText('777 Pa');
  await expect(panel(page)).toContainText('06:46–18:51');
  await expect(panel(page)).toContainText(/Ground temperature\s*−84 °C to 4 °C/);
  await expect(panel(page)).toContainText(/UV level\s*Moderate/);
  const history = page.getByTestId('mars-history');
  await expect(history).toContainText('Sols 4988–4995');
  await expect(history).toContainText('\u221275 °C to \u22122 °C');
  // Two missing sols split the highs into two lines and leave the newest sol on its own as a dot.
  await expect(history.locator('polyline.high')).toHaveCount(2);
  await expect(history.locator('circle.high')).toHaveCount(1);
  expect(logs[0]).toMatch(/^\[weather\] GET .*\/data\/weather\.json$/);
  await expect.poll(() => logs.join('\n')).toMatch(/\[weather\] data built \d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  expect(upstream).toEqual([]);
});

test('handles a data file from before ground temperature and UV were added', async ({ page }) => {
  const older = JSON.parse(sample);
  for (const k of ['minGroundTemp', 'maxGroundTemp', 'uvIndex']) delete older.mars.report[k];
  await page.unroute(DATA);
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(older) }));
  const errors = trackErrors(page);
  await page.goto('/');
  await select(page, 'Mars');

  await expect(panel(page)).toContainText('−71 °C to −5 °C');
  await expect(panel(page)).not.toContainText('Ground temperature');
  await expect(panel(page)).not.toContainText('UV level');
  expect(errors).toEqual([]);
});

test('shows live solar wind on the Sun panel', async ({ page }) => {
  await page.goto('/');
  await select(page, 'Sun');

  const card = page.getByTestId('solar-wind');
  await expect(card).toContainText('538 km/s');
  await expect(card).toContainText('Last 24 h: 512–538 km/s');
  await expect(card).toContainText('5.1 protons/cm³');
  await expect(card).toContainText("by NOAA's SOLAR1 spacecraft");
  await expect(card.getByRole('img')).toBeVisible();
  await expect(card).toContainText(/Measured\s*\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} UTC \(5 min ago\) by NOAA's SOLAR1 spacecraft/);
  await expect(card.getByRole('status')).toHaveCount(0);
});

test('warns when the solar wind reading is old', async ({ page }) => {
  await page.unroute(DATA);
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: sampleAged(5 * 60) }));
  await page.goto('/');
  await select(page, 'Sun');

  const card = page.getByTestId('solar-wind');
  await expect(card).toContainText('(5 h ago)');
  await expect(card.getByRole('status')).toHaveText('This reading is 5 hours old, so it may not reflect conditions now.');
});

test('shows computed sunlight and seasons for each planet', async ({ page }) => {
  await page.goto('/');
  const section = page.getByTestId('sun-seasons');

  await select(page, 'Mars');
  await expect(section).toContainText(/Sunlight\s*\d+ W\/m² · \d+% of Earth's/);
  await expect(section).toContainText(/Season\s*(Spring|Summer|Autumn|Winter) in the north/);
  await expect(section).toContainText(/Next\s*Northern (spring|summer|autumn|winter) (equinox|solstice)/);

  await expect(section).toContainText(/Over its orbit\s*490–713 W\/m²/);
  await expect(panel(page)).toContainText(/Season on that sol\s*late northern winter/);

  await select(page, 'Mercury');
  await expect(section).toContainText(/Over its orbit\s*6,249 W\/m² to 14\.4 kW\/m²/);

  await select(page, 'Jupiter');
  await expect(section).toContainText('Barely any: axis tilted 3.1°');

  await select(page, 'Venus');
  await expect(section).toContainText('177.36°, so it spins backwards');

  await select(page, 'Uranus');
  await expect(section).toContainText('Each season lasts about 21 years');

  await select(page, 'Sun');
  await expect(section).toHaveCount(0);
});

test('falls back to the stored report when the data file is missing', async ({ page }) => {
  await page.unroute(DATA);
  await page.route(DATA, (route) => route.fulfill({ status: 404, body: 'Not found' }));
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.goto('/');
  await select(page, 'Mars');

  await expect(page.getByTestId('weather-source')).toContainText("NASA's feed couldn't be reached, so this is a saved copy of the latest report.");
  await expect(panel(page)).toContainText('mission sol 4995');
  await expect.poll(() => warnings.join('\n')).toMatch(/\[weather\] using stored report: HTTP 404/);

  await select(page, 'Sun');
  await expect(page.getByTestId('solar-wind')).toHaveCount(0);
  await expect(page.getByTestId('solar-wind-empty')).toHaveText('Live solar wind readings are unavailable right now.');
});

test('visible planet labels never overlap', async ({ page }) => {
  await page.goto('/');
  await expect(labels(page).getByRole('button', { name: 'Earth', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();

  const boxes = await page.locator('.label:not([hidden])').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent?.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    })
  );
  expect(boxes.length).toBeGreaterThan(3);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
    }
  }
});

test('the prerendered page carries no build-time date', async ({ request }) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toMatch(/Mars Sol Date \d/);
  expect(html).not.toMatch(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
});

test('without WebGL it explains why and keeps the panel working', async ({ page }) => {
  await page.addInitScript(() => {
    type GetContext = (this: HTMLCanvasElement, type: string, ...rest: unknown[]) => RenderingContext | null;
    const original = HTMLCanvasElement.prototype.getContext as GetContext;
    const blocked: GetContext = function (type, ...rest) {
      return type.startsWith('webgl') ? null : original.call(this, type, ...rest);
    };
    HTMLCanvasElement.prototype.getContext = blocked as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');

  await expect(page.getByRole('status')).toContainText('3D view unavailable');
  await expect(panel(page)).toContainText('From Earth');
  await expect(page.getByTestId('clock')).toContainText('UTC');

  // Without labels to click, the World menu still reaches every body.
  await page.getByRole('combobox', { name: 'World' }).selectOption({ label: 'Mars' });
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  await expect(panel(page)).toContainText('Curiosity weather report');
});

test('opens live in real time and says when the clock is simulated', async ({ page }) => {
  await page.goto('/');
  const status = page.getByTestId('clock-status');
  const speed = page.getByRole('combobox', { name: 'Playback speed' });
  const now = page.getByRole('button', { name: 'Now' });

  await expect(status).toHaveText('Live');
  await expect(speed.locator('option:checked')).toHaveText('Real time');
  await expect(now).toBeDisabled();
  await expect(page.getByTestId('clock')).toContainText(/\d{2}:\d{2} UTC/);

  await speed.selectOption({ label: '1 year / s' });
  await expect(status).toHaveText('Simulated');
  await expect(now).toBeEnabled();

  await now.click();
  await expect(status).toHaveText('Live');
  await expect(speed.locator('option:checked')).toHaveText('Real time');

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(status).toHaveText('Paused');
});

test('stays live in real time when the viewer prefers reduced motion', async ({ page }) => {
  // Real time moves too slowly to see, and the scene stops planet spin, so there is no motion to avoid.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.stage canvas')).toBeVisible();
  await expect(page.getByTestId('clock-status')).toHaveText('Live');
});

test('the World menu reaches every body, including ones whose label is hidden', async ({ page }) => {
  await page.goto('/');
  const world = page.getByRole('combobox', { name: 'World' });
  for (const name of ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    await world.selectOption({ label: name });
    await expect(panel(page).getByRole('heading', { name })).toBeVisible();
  }
  await world.selectOption({ label: 'Overview' });
  await expect(panel(page).getByRole('heading', { name: 'Pick a world' })).toBeVisible();
});

test('a new selection starts at the top of the panel with focus on its heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const world = page.getByRole('combobox', { name: 'World' });
  await select(page, 'Mars');
  const aside = panel(page);
  await expect(aside.getByRole('heading', { name: 'Mars' })).toBeFocused();
  await aside.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await aside.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await select(page, 'Sun');
  await expect(aside.getByRole('heading', { name: 'Sun' })).toBeFocused();
  expect(await aside.evaluate((el) => el.scrollTop)).toBe(0);

  // Closing from the keyboard returns focus to the World menu rather than dropping it on the page.
  await aside.getByRole('button', { name: /^Close Sun/ }).focus();
  await page.keyboard.press('Enter');
  await expect(world).toBeFocused();
  await expect(world).toHaveValue('');

  // Escape does the same.
  await world.selectOption({ label: 'Mars' });
  await page.keyboard.press('Escape');
  await expect(world).toBeFocused();
});

// Focusing a <select> from script makes iOS Safari open its picker, so a tap must not do it.
test('closing a panel with a tap leaves the World menu alone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const world = page.getByRole('combobox', { name: 'World' });
  await world.selectOption({ label: 'Mars' });
  await panel(page).getByRole('button', { name: /^Close Mars/ }).click();
  await expect(world).toHaveValue('');
  await expect(world).not.toBeFocused();
});

test('play and pause is a plain button, and picking a speed resumes playback', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Pause' });
  await expect(button).not.toHaveAttribute('aria-pressed');
  await button.click();
  await expect(page.getByTestId('clock-status')).toHaveText('Paused');
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption({ label: '1 year / s' });
  await expect(page.getByTestId('clock-status')).toHaveText('Simulated');
  await expect(page.getByTestId('clock-offset')).toContainText('ahead from today');
});

test('planet labels stay clear of the header, panel and toolbar', async ({ page }) => {
  for (const size of [{ width: 1400, height: 860 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(labels(page).getByRole('button', { name: 'Sun', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.waitForTimeout(500);
    const overlaps = await page.evaluate(() => {
      const areas = [...document.querySelectorAll('[data-label-avoid]')].map((el) => el.getBoundingClientRect());
      return [...document.querySelectorAll<HTMLElement>('.label:not([hidden])')]
        .filter((l) => {
          const r = l.getBoundingClientRect();
          return areas.some((a) => r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top);
        })
        .map((l) => l.textContent?.trim());
    });
    expect(overlaps, `labels under page UI at ${size.width}px`).toEqual([]);
  }
});

test('the overview lists every world, and each row opens it', async ({ page }) => {
  await page.goto('/');
  const table = page.getByTestId('worlds');
  await expect(table.locator('tbody tr')).toHaveCount(9);
  await expect(table).toContainText(/Saturn\s*\d+\.\d+ AU\s*Northern (spring|summer|autumn|winter)/);
  await expect(table).toContainText(/Jupiter\s*\d+\.\d+ AU\s*No seasons/);
  await expect(table).toContainText(/Sun\s*\d\.\d+ AU\s*Wind \d+ km\/s/);
  await expect(panel(page)).not.toContainText('Mars right now');

  await table.getByRole('button', { name: 'Saturn' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Saturn' })).toBeFocused();
});

test('loads the planet images and credits them', async ({ page }) => {
  const errors = trackErrors(page);
  const loaded: string[] = [];
  page.on('response', (r) => r.ok() && /\/textures\/[\w-]+\.webp$/.test(r.url()) && loaded.push(r.url().split('/').pop()!));
  await page.goto('/');
  await expect.poll(() => loaded.sort()).toEqual(
    ['earth', 'jupiter', 'mars', 'mercury', 'moon', 'neptune', 'saturn-ring', 'saturn', 'sun', 'uranus'].map((n) => `${n}.webp`).sort()
  );
  const credit = page.getByTestId('texture-credit');
  await expect(credit).toContainText('Solar System Scope');
  await expect(credit.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  expect(errors).toEqual([]);
});

test('a planet image that fails to load leaves the drawn texture', async ({ page }) => {
  const thrown: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', (e) => thrown.push(e.message));
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  await page.route('**/textures/mars.webp', (route) => route.fulfill({ status: 404 }));
  await page.goto('/');
  await expect.poll(() => warnings.join('\n')).toContain("mars.webp didn't load");
  await select(page, 'Mars');
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  expect(thrown).toEqual([]);
});

test('the distances toggle switches between compressed and to scale, and says planets stay enlarged', async ({ page }) => {
  await page.goto('/');
  const toScale = page.getByRole('button', { name: 'To scale', exact: true });
  const compressed = page.getByRole('button', { name: 'Compressed', exact: true });
  await expect(compressed).toHaveAttribute('aria-pressed', 'true');
  await expect(toScale).toHaveAttribute('title', /larger than life/);

  await toScale.click();
  await expect(toScale).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Distances to scale \(planets are still drawn larger than life\)/)).toBeVisible();

  await compressed.click();
  await expect(page.getByText(/Distances to scale/)).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the overview sheet starts folded, opens on request, and opens when a world is picked', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    const table = page.getByTestId('worlds');
    await expect(panel(page).getByRole('heading', { name: 'Pick a world' })).toBeVisible();
    await expect(table).toBeHidden();

    const show = page.getByRole('button', { name: 'Show worlds' });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await show.click();
    await expect(table).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(table).toBeHidden();

    await page.locator('select[name="world"]').selectOption({ label: 'Mars' });
    await expect(panel(page)).toContainText('Curiosity weather report');
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(panel(page).getByText('Curiosity weather report')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Show details' })).toBeVisible();

    await page.getByRole('button', { name: /^Close Mars/ }).click();
    await expect(table).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test('on wider screens the panel never folds', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('worlds')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show worlds' })).toBeHidden();
});

test('planet panels show physical facts, moons, rings and missions', async ({ page }) => {
  await page.goto('/');
  await select(page, 'Saturn');
  const p = panel(page);
  await expect(p).toContainText(/Moons\s*285\+/);
  await expect(p).toContainText(/Gravity\s*9\.0 m\/s² · 0\.92× Earth’s/);
  await expect(p).toContainText(/Density\s*0\.69 g\/cm³, less than water/);
  const facts = page.getByTestId('facts');
  await expect(facts).toContainText('Titan');
  await expect(facts).toContainText(/as of mid-2026/);
  await expect(facts).toContainText('Cassini');

  await select(page, 'Venus');
  await expect(p).toContainText(/Moons\s*None/);
  await expect(page.getByTestId('facts')).toContainText('Carbon dioxide 96.5%');

  await select(page, 'Sun');
  await expect(page.getByTestId('facts')).toContainText('Made of');
  await expect(p).toContainText(/Mass\s*333,000 × Earth/);
});

test('Earth shows live space weather: Kp, storm level, a 3-day chart and where auroras reach', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await select(page, 'Earth');
  const card = page.getByTestId('kp');
  await expect(card).toContainText(/Kp 3\.3\s*Unsettled/);
  await expect(card).toContainText('Peak: Kp 5.3');
  await expect(card.locator('rect')).toHaveCount(24);
  await expect(card.locator('rect.storm')).toHaveCount(2);
  await expect(card).toContainText('Iceland');
  await expect(card).toContainText(/Covers\s*\d+ \w+, \d\d:\d\d–\d\d:\d\d UTC/);
  expect(errors).toEqual([]);
});

test('Earth explains when space weather is unavailable', async ({ page }) => {
  const d = JSON.parse(sample);
  delete d.kp;
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }));
  await page.goto('/');
  await select(page, 'Earth');
  await expect(page.getByTestId('kp-empty')).toBeVisible();
});

test('the Sun shows solar flares: class now, 24-hour peak and radio blackout level', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await select(page, 'Sun');
  const card = page.getByTestId('flares');
  await expect(card).toContainText(/C1\.\d\s*C-class/);
  await expect(card).toContainText(/24 h peak\s*M2\.\d at/);
  await expect(card).toContainText("rates R1 (minor) on NOAA's radio blackout scale");
  await expect(card).toContainText('GOES-19');
  await expect(card.locator('text')).toHaveText(['C', 'M', 'X']);
  expect(errors).toEqual([]);
});

test('the Sun explains when flare readings are unavailable', async ({ page }) => {
  const d = JSON.parse(sample);
  delete d.xray;
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }));
  await page.goto('/');
  await select(page, 'Sun');
  await expect(page.getByTestId('flares-empty')).toBeVisible();
});

test('spacecraft appear in the World menu and open a panel with distance, signal time and speed', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const world = page.getByRole('combobox', { name: 'World' });
  await expect(world.locator('optgroup[label="Spacecraft"] option')).toHaveText(['Voyager 1', 'Parker Solar Probe']);

  await world.selectOption({ label: 'Voyager 1' });
  const p = panel(page);
  await expect(p.getByRole('heading', { name: 'Voyager 1' })).toBeVisible();
  await expect(p).toContainText(/From the Sun\s*1\d\d\.\d\d AU/);
  await expect(p).toContainText(/Radio signal takes\s*\d+ h/);
  await expect(p).toContainText(/Speed\s*16\.9 km\/s/);
  await expect(p).toContainText('interstellar space');
  await expect(page.getByTestId('craft-source')).toContainText('Horizons');
  await expect(labels(page).getByRole('button', { name: 'Voyager 1', includeHidden: true })).toHaveClass(/active/);

  // Parker's label can be clicked like a planet's.
  await world.selectOption({ label: 'Overview' });
  await select(page, 'Parker Solar Probe');
  await expect(p.getByRole('heading', { name: 'Parker Solar Probe' })).toBeVisible();
  await expect(p).toContainText(/From the Sun\s*0\.200 AU/);
  expect(errors).toEqual([]);
});

test('a spacecraft outside its known trajectory says when it can be seen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'World' }).selectOption({ label: 'Parker Solar Probe' });
  // Jump the clock far back: Parker's sample covers only the last few weeks.
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption({ label: '−10 days / s' });
  await expect(page.getByTestId('craft-out-of-range')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('craft-out-of-range')).toContainText('Set the clock inside those dates');
  await expect(page.getByTestId('craft-out-of-range')).toContainText('about 6 months of its path around today');
});

test('without spacecraft data the orrery still works and the menu lists no spacecraft', async ({ page }) => {
  await page.route(CRAFT_DATA, (route) => route.fulfill({ status: 404 }));
  const thrown: string[] = [];
  page.on('pageerror', (e) => thrown.push(e.message));
  await page.goto('/');
  await expect(labels(page).getByRole('button', { name: 'Sun', exact: true })).toBeVisible();
  await expect(page.locator('optgroup[label="Spacecraft"]')).toHaveCount(0);
  expect(thrown).toEqual([]);
});

test('the arrow keys step through the World menu without focus jumping to the panel', async ({ page }) => {
  await page.goto('/');
  const world = page.getByRole('combobox', { name: 'World' });
  await world.focus();
  // Picking from the menu (here, by keyboard) keeps focus on the menu but still opens the world.
  await world.selectOption({ label: 'Sun' });
  await expect(panel(page).getByRole('heading', { name: 'Sun' })).toBeVisible();
  await expect(world).toBeFocused();
  await world.press('ArrowDown');
  await expect(world).toBeFocused();
  await expect(page.locator('p[aria-live="polite"]')).toContainText('selected');
});

test('a spacecraft on an Earth flyby shows its distance from Earth as approximate', async ({ page }) => {
  // Constructed: Europa Clipper parked 0.01 AU (1.5 million km) from where Earth is today.
  const DAY = 86_400_000;
  const e = planetPosition('earth', Date.now());
  const at = [e.x + 0.01, e.y, e.z];
  const d = JSON.parse(craftSample());
  d.craft.push({ id: 'europa-clipper', source: 'live', fetchedAt: d.generatedAt, start: new Date(Date.now() - DAY).toISOString(), stepMs: 2 * DAY, p: [...at, ...at], v: [0, 0, 0, 0, 0, 0] });
  await page.route(CRAFT_DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'World' }).selectOption({ label: 'Europa Clipper' });
  await expect(panel(page)).toContainText(/From Earth\s*about 1\.\d million km, approximate during this Earth flyby/);
  await expect(panel(page)).toContainText(/Radio signal takes\s*about \d\.\d minutes/);
});

test('on a phone the controls are comfortable touch targets and the sheet sits clear of the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const name of ['Pause', 'Now', 'Compressed', 'To scale']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  const toolbar = await page.getByRole('toolbar').boundingBox();
  const sheet = await panel(page).boundingBox();
  expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(toolbar!.y - 4);
});

test('clicking a spacecraft marker in the 3D view selects it', async ({ page }) => {
  // Constructed: one spacecraft parked at 3.5 AU in the direction farthest from every planet
  // today, so nothing else's label competes with its own. The overview camera holds still.
  const DAY = 86_400_000;
  const ids = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
  const lons = ids.map((id) => { const p = planetPosition(id, Date.now()); return Math.atan2(p.y, p.x); });
  const gap = (a: number) => Math.min(...lons.map((l) => Math.abs(((a - l + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)));
  let best = 0;
  for (let a = 0; a < 2 * Math.PI; a += 0.05) if (gap(a) > gap(best)) best = a;
  const at = [3.5 * Math.cos(best), 3.5 * Math.sin(best), 0];
  const fetchedAt = new Date().toISOString();
  const data = { version: 1, generatedAt: fetchedAt, missing: [], craft: [
    { id: 'juice', source: 'live', fetchedAt, start: new Date(Date.now() - DAY).toISOString(), stepMs: 2 * DAY, p: [...at, ...at], v: [0, 0, 0, 0, 0, 0] }
  ] };
  await page.route(CRAFT_DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
  await page.goto('/');
  const label = labels(page).getByRole('button', { name: 'JUICE' });
  await expect(label).toBeVisible();
  // The camera eases into the overview after loading, slowly on a busy machine, so measure and
  // click again until the click lands where the marker now is.
  await expect(async () => {
    const box = (await label.boundingBox())!;
    // The label sits 8 px above the marker; aim just below it, a little off the marker's centre.
    await page.mouse.click(box.x + box.width / 2 + 3, box.y + box.height + 9);
    await expect(panel(page).getByRole('heading', { name: 'JUICE' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
});

test('planets show their moons, labelled while the planet is selected', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const moonLabel = (name: string) => labels(page).locator('.label.moon', { hasText: name });
  await expect(moonLabel('Ganymede')).toBeHidden();
  await select(page, 'Jupiter');
  for (const name of ['Io', 'Europa', 'Ganymede', 'Callisto']) await expect(moonLabel(name)).toBeVisible();
  await expect(page.getByTestId('moons-shown')).toContainText('In the 3D view: Io, Europa, Ganymede and Callisto');

  await select(page, 'Earth');
  await expect(moonLabel('Moon')).toBeVisible();
  await expect(moonLabel('Ganymede')).toBeHidden();
  await expect(page.getByTestId('moons-shown')).toContainText('In the 3D view: the Moon, in its real direction from Earth');
  expect(errors).toEqual([]);
});

test('Voyager and Parker load their NASA 3D models only when selected', async ({ page }) => {
  const errors = trackErrors(page);
  const fetched: string[] = [];
  page.on('response', (r) => r.ok() && /\/(models|draco)\//.test(r.url()) && fetched.push(r.url().split('/').slice(-2).join('/')));
  await page.goto('/');
  await page.waitForTimeout(1000);
  expect(fetched).toEqual([]); // nothing loads until a spacecraft with a model is picked

  await page.getByRole('combobox', { name: 'World' }).selectOption({ label: 'Voyager 1' });
  await expect.poll(() => fetched.sort()).toEqual(['draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js', 'models/voyager.glb']);
  await expect(panel(page)).toContainText('3D model from NASA 3D Resources');
  await expect(panel(page)).toContainText('dish to Earth');

  await page.getByRole('combobox', { name: 'World' }).selectOption({ label: 'Parker Solar Probe' });
  await expect.poll(() => fetched).toContain('models/parker.glb');
  await expect(panel(page)).toContainText('heat shield to the Sun');
  expect(errors).toEqual([]);
});

test('the overview sums up the solar system today and lists what is coming up', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const today = page.getByTestId('today');
  await expect(today).toContainText(/Sun\s*Small C-class flares \(C1\.\d\) · solar wind \d+ km\/s/);
  await expect(today).toContainText(/Earth\s*Kp 3\.3, unsettled: auroras at high latitudes/);
  await expect(today).toContainText(/Moon\s*(New moon|Waxing|First|Full|Waning|Last)[^,]*, \d+% lit/);
  await expect(today).toContainText(/Mars\s*−71 °C to −5 °C at Gale Crater/);
  await expect(today).toContainText(/Voyager 1\s*\d+ h \d+ min away at the speed of light/);
  await today.getByRole('button', { name: 'Mars' }).click();
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  await page.keyboard.press('Escape');

  const coming = page.getByTestId('coming-up');
  await expect(coming.locator('li')).toHaveCount(6);
  const first = coming.locator('li button').first();
  const label = (await first.getAttribute('aria-label'))!;
  await first.click();
  // The clock jumps to the event and pauses; the status shows a simulated date.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByText('Paused')).toBeVisible();
  expect(label).toMatch(/set the clock to then/);
  expect(errors).toEqual([]);
});

test('tonight’s sky uses the browser location, remembers it and lists what is up', async ({ page, context }) => {
  const errors = trackErrors(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
  await page.goto('/');
  const tonight = page.getByTestId('tonight');
  await tonight.getByRole('button', { name: 'Use my location' }).click();
  // Rounded to 0.1° before it is shown or stored.
  await expect(tonight.getByText('Tonight’s sky · 51.5° N, 0.1° W')).toBeVisible();
  await expect(tonight).toContainText(/Dark (now until|from)/);
  await page.reload();
  await expect(tonight.getByText('Tonight’s sky · 51.5° N, 0.1° W')).toBeVisible();
  await tonight.getByRole('button', { name: 'Change place' }).click();
  await tonight.getByText('Or enter a place').click();
  await tonight.getByLabel('Latitude').fill('-33.9');
  await tonight.getByLabel('Longitude').fill('151.2');
  await tonight.getByRole('button', { name: 'Show' }).click();
  await expect(tonight.getByText('Tonight’s sky · 33.9° S, 151.2° E')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tonight’s sky explains a declined location and rejects bad coordinates', async ({ page }) => {
  await page.goto('/');
  const tonight = page.getByTestId('tonight');
  await tonight.getByRole('button', { name: 'Use my location' }).click();
  await expect(tonight.getByRole('status')).toContainText('Enter one below instead');
  await tonight.getByText('Or enter a place').click();
  await tonight.getByLabel('Latitude').fill('95');
  await tonight.getByLabel('Longitude').fill('0');
  await tonight.getByRole('button', { name: 'Show' }).click();
  await expect(tonight.getByRole('status')).toContainText('Latitude runs from −90 to 90');
});
