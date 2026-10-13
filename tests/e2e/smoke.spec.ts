import { expect, test, type Page } from '@playwright/test';

// Fail the test on any console error or uncaught exception.
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const panel = (page: Page) => page.locator('aside.panel');

test('renders the solar system and opens the Mars panel', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');

  await expect(page.locator('.stage canvas')).toBeVisible();
  const mars = page.getByRole('button', { name: 'Mars', exact: true });
  await expect(mars).toBeVisible();
  await expect(panel(page)).toContainText('From Earth');

  // Labels move every frame, so click through the DOM rather than waiting for them to settle.
  await mars.evaluate((el: HTMLElement) => el.click());
  await expect(panel(page).getByRole('heading', { name: 'Mars' })).toBeVisible();
  await expect(panel(page)).toContainText('Latest Curiosity weather report');
  await expect(panel(page)).toContainText('Signal delay');

  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('heading', { name: 'Pick a world' })).toBeVisible();

  expect(errors).toEqual([]);
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

test('starts paused when the viewer prefers reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.stage canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
});
