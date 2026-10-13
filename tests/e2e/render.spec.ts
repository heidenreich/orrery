import { expect, test } from '@playwright/test';

// Counts WebGL draw calls, to check the scene only draws when something can change.
test('draws nothing while paused, and keeps drawing while live', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['drawArrays', 'drawElements'] as const) {
        const original = proto[name] as (...args: unknown[]) => void;
        (proto as unknown as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
          w.__draws++;
          return original.apply(this, args);
        };
      }
    }
  });
  await page.route('**/data/weather.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.locator('.stage canvas')).toBeVisible();
  const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);

  // Live: the planets spin, so frames keep coming.
  await page.waitForTimeout(1500);
  const a = await draws();
  await page.waitForTimeout(1000);
  expect(await draws()).toBeGreaterThan(a);

  // Paused, with the camera still settling from the start: wait for it, then nothing should draw.
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(2500);
  const b = await draws();
  await page.waitForTimeout(1500);
  expect(await draws()).toBe(b);

  // Interaction wakes it up again.
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(300);
  expect(await draws()).toBeGreaterThan(b);
});
