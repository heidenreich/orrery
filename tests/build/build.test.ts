// Checks the site that is about to be deployed: the real build, with its base path and live data.
// Run after `npm run build`, with the same BASE_PATH: `npm run test:build`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWeatherData } from '../../src/lib/data/weather-data';
import { parseSpacecraftData } from '../../src/lib/data/spacecraft-data';

const dir = process.env.BUILD_DIR ?? 'build';
const base = process.env.BASE_PATH ?? '';
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

describe('built site', () => {
  it('has the page and the fallback page', () => {
    expect(existsSync(join(dir, 'index.html'))).toBe(true);
    expect(existsSync(join(dir, '404.html'))).toBe(true);
  });

  it(`was built for the base path "${base}"`, () => {
    // SvelteKit writes the base path as `assets: "/orrery"`, and leaves the line out for the site root.
    const html = read('index.html');
    if (base) expect(html).toContain(`assets: ${JSON.stringify(base)}`);
    else expect(html).not.toMatch(/\bassets: "/);
  });

  it('references only files that exist', () => {
    const html = read('index.html');
    const refs = [...html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)].map((m) => m[1]);
    const imports = [...html.matchAll(/import\("\.\/([^"]+)"\)/g)].map((m) => m[1]);
    const files = [...new Set([...refs, ...imports])];
    expect(files.length).toBeGreaterThan(3);
    expect(files.filter((f) => !existsSync(join(dir, f)))).toEqual([]);
  });

  it('ships the link preview image the page names', () => {
    const url = read('index.html').match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(url).toMatch(/^https:\/\/heidenreich\.github\.io\/orrery\/og\.jpg$/);
    expect(existsSync(join(dir, 'og.jpg'))).toBe(true);
  });

  it('ships a valid spacecraft data file', () => {
    const parsed = parseSpacecraftData(JSON.parse(read('data/spacecraft.json')));
    if (!parsed.ok) throw new Error(`data/spacecraft.json is invalid: ${parsed.reason}`);
    const { craft, missing } = parsed.data;
    // Not a failure: Horizons can be down, and the offline test build has none.
    console.log(`spacecraft: ${craft.map((t) => `${t.id} ${t.source} (${t.p.length / 3})`).join(', ') || 'none'}${missing.length ? `; missing ${missing.map((m) => m.id).join(', ')}` : ''}`);
    expect(read('data/spacecraft.json').length).toBeLessThan(250_000);
  });

  it('ships every texture image the scripts ask for, with its licence', () => {
    const scripts = readdirSync(join(dir, '_app'), { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.js'));
    const wanted = new Set(scripts.flatMap((f) => [...read(join('_app', f)).matchAll(/textures\/([\w-]+\.webp)/g)].map((m) => m[1])));
    expect(wanted.size).toBe(9);
    expect([...wanted].filter((f) => !existsSync(join(dir, 'textures', f)))).toEqual([]);
    expect(read('textures/LICENSE.txt')).toContain('Creative Commons Attribution 4.0');
  });

  it('ships a valid weather data file and reports what it holds', () => {
    const parsed = parseWeatherData(JSON.parse(read('data/weather.json')));
    if (!parsed.ok) throw new Error(`data/weather.json is invalid: ${parsed.reason}`);
    const { mars, solarWind, kp, xray } = parsed.data;
    // Not a failure: a feed outage legitimately falls back. Printed so CI logs show what shipped.
    console.log(`data: mars ${mars.source} (sol ${mars.report.sol}), solar wind ${solarWind.source}, kp ${kp.source}, x-ray ${xray.source}`);
    expect(JSON.stringify(parsed.data).length).toBeLessThan(50_000);
  });
});
