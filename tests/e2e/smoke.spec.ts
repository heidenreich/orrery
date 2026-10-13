import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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
  return JSON.stringify(d);
}
const sample = sampleAged();

// Serve a known data file (the test build skips the network), and record any request to the
// upstream feeds: the browser should never call NASA or NOAA itself.
let upstream: string[] = [];
test.beforeEach(async ({ page }) => {
  upstream = [];
  page.on('request', (r) => /mars\.nasa\.gov|swpc\.noaa\.gov/.test(r.url()) && upstream.push(r.url()));
  await page.route(DATA, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: sample }));
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
  await expect(labels(page).getByRole('button', { name: 'Mars', exact: true })).toBeVisible();
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
  await expect(card).toContainText('by SOLAR1');
  await expect(card.getByRole('img')).toBeVisible();
  await expect(card).toContainText(/Measured\s*\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} UTC \(5 min ago\) by SOLAR1/);
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
  await expect(panel(page)).toContainText(/Season then\s*late northern winter/);

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
  await world.selectOption({ label: 'Mars' });
  const aside = panel(page);
  await expect(aside.getByRole('heading', { name: 'Mars' })).toBeFocused();
  await aside.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await aside.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await world.selectOption({ label: 'Sun' });
  await expect(aside.getByRole('heading', { name: 'Sun' })).toBeFocused();
  expect(await aside.evaluate((el) => el.scrollTop)).toBe(0);

  // Closing returns focus to the World menu rather than dropping it on the page.
  await aside.getByRole('button', { name: /^Close Sun/ }).click();
  await expect(world).toBeFocused();
  await expect(world).toHaveValue('');
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
    await expect(labels(page).getByRole('button', { name: 'Mars', exact: true })).toBeVisible();
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
    ['earth', 'jupiter', 'mars', 'mercury', 'neptune', 'saturn-ring', 'saturn', 'sun', 'uranus'].map((n) => `${n}.webp`).sort()
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
