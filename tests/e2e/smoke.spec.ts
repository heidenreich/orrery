import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DATA = '**/data/weather.json';
const sample = readFileSync(new URL('./weather-sample.json', import.meta.url), 'utf8');

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
const select = (page: Page, name: string) =>
  // Labels move every frame and hide when off screen (e.g. after zooming to another planet),
  // so find them even when hidden and click through the DOM.
  page.getByRole('button', { name, exact: true, includeHidden: true }).evaluate((el: HTMLElement) => el.click());

test('renders the solar system and opens the Mars panel', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  await expect(page.locator('.stage canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mars', exact: true })).toBeVisible();
  await expect(panel(page)).toContainText('From Earth');

  await select(page, 'Mars');
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  await expect(panel(page)).toContainText('Latest Curiosity weather report');
  await expect(panel(page)).toContainText('Signal delay');

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

  await expect(page.getByTestId('weather-source')).toHaveText(/^From NASA's REMS feed, checked .+ ago\.$/);
  await expect(panel(page)).toContainText('-71 °C to -5 °C');
  await expect(panel(page)).toContainText('777 Pa');
  await expect(panel(page)).toContainText('06:46–18:51');
  expect(logs[0]).toMatch(/^\[weather\] GET .*\/data\/weather\.json$/);
  await expect.poll(() => logs.join('\n')).toMatch(/\[weather\] data built 2026-10-13T13:00:00.000Z/);
  expect(upstream).toEqual([]);
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
});

test('shows computed sunlight and seasons for each planet', async ({ page }) => {
  await page.goto('/');
  const section = page.getByTestId('sun-seasons');

  await select(page, 'Mars');
  await expect(section).toContainText(/Sunlight\s*\d+ W\/m² · \d+% of Earth's/);
  await expect(section).toContainText(/Season\s*(Spring|Summer|Autumn|Winter) in the north/);
  await expect(section).toContainText(/Next\s*Northern (spring|summer|autumn|winter) (equinox|solstice)/);

  await expect(section).toContainText(/Over its orbit\s*490–713 W\/m²/);
  await expect(panel(page)).toContainText(/Season then\s*Ls 341°, month 12/);

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

  await expect(page.getByTestId('weather-source')).toContainText('Stored report from 13 Oct 2026');
  await expect(panel(page)).toContainText('Sol 4995');
  await expect.poll(() => warnings.join('\n')).toMatch(/\[weather\] using stored report: HTTP 404/);

  await select(page, 'Sun');
  await expect(page.getByTestId('solar-wind')).toHaveCount(0);
});

test('visible planet labels never overlap', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Earth', exact: true })).toBeVisible();
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
  await expect(page.getByTestId('clock')).toContainText('Mars Sol Date');
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
