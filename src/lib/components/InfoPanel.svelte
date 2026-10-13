<script lang="ts">
  import SolarWindCard from '$lib/components/SolarWindCard.svelte';
  import SunAndSeasons from '$lib/components/SunAndSeasons.svelte';
  import { STORED_MARS_REPORT, STORED_REPORT_CHECKED } from '$lib/data/mars-report';
  import type { WeatherData } from '$lib/data/weather-data';
  import { bodyById, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import { distance, length, marsSolDate } from '$lib/orrery/orbits';

  interface Props {
    selected: BodyId | null;
    simMs: number | null;
    positions: PositionsAU | null;
    /** Null while the data file is loading. */
    weather: WeatherData | null;
    onclose: () => void;
  }

  let { selected, simMs, positions, weather, onclose }: Props = $props();

  const report = $derived(weather?.mars.report ?? STORED_MARS_REPORT);
  const fmtTemp = (c: number) => `${Math.round(c)} °C`;
  // Show the feed's wording in sentence case, with any underscores as spaces.
  const uvText = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };

  function ago(iso: string) {
    const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
  }

  const body = $derived(selected ? bodyById(selected) : null);
  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const fmtAU = (au: number) => `${au.toFixed(au < 10 ? 3 : 2)} AU`;
  const fmtKm = (au: number) => `${(au * 149.5978707).toFixed(au < 10 ? 1 : 0)} M km`;
  function fmtLight(au: number) {
    const min = au * 8.3167;
    return min < 120 ? `${min.toFixed(1)} light-min` : `${(min / 60).toFixed(2)} light-h`;
  }

  // Live distances for the selected body, or Mars on the overview.
  const live = $derived.by(() => {
    if (!positions || simMs === null) return [];
    const earth = positions.earth;
    const id = selected ?? 'mars';
    if (id === 'sun') {
      const d = length(earth);
      return [['From Earth', `${fmtAU(d)} · ${fmtKm(d)}`], ['Light time', fmtLight(d)]];
    }
    const p = positions[id];
    const rows: [string, string][] = [['From the Sun', fmtAU(length(p))]];
    if (id !== 'earth') {
      const d = distance(p, earth);
      rows.push(['From Earth', `${fmtAU(d)} · ${fmtKm(d)}`], ['Signal delay', fmtLight(d)]);
    }
    if (id === 'mars') rows.push(['Mars Sol Date', Math.floor(marsSolDate(simMs)).toLocaleString('en-US')]);
    return rows;
  });
</script>

<aside class="panel surface" aria-live="polite">
  {#if !body}
    <header>
      <div>
        <p class="eyebrow">Orrery</p>
        <h2>Pick a world</h2>
      </div>
    </header>
    <p>Planet positions are computed for the date shown, from JPL's orbital elements. Select a planet to see its weather.</p>
    <p class="hint">Drag to rotate · scroll or pinch to zoom · Esc returns to the overview.</p>
    <div>
      <p class="eyebrow section">Mars right now</p>
      {@render stats(live)}
    </div>
  {:else}
    <header>
      <div>
        <p class="eyebrow">{body.kind}</p>
        <h2>{body.name}</h2>
      </div>
      <button class="close" aria-label="Back to overview" onclick={onclose}>×</button>
    </header>

    {#if body.id === 'mars'}
      <div class="report">
        <p class="eyebrow">Latest Curiosity weather report</p>
        <div class="big">Sol {report.sol}</div>
        <dl class="stats">
          <dt>Earth date</dt>
          <dd>{fmtDate.format(new Date(`${report.earthDate}T00:00:00Z`))}</dd>
          {#if report.minTemp !== null || report.maxTemp !== null}
            <dt>Air temperature</dt>
            <dd>{report.minTemp !== null ? fmtTemp(report.minTemp) : '?'} to {report.maxTemp !== null ? fmtTemp(report.maxTemp) : '?'}</dd>
          {/if}
          {#if report.pressure !== null}<dt>Pressure</dt><dd>{report.pressure.toLocaleString('en-US')} Pa</dd>{/if}
          {#if report.sunrise && report.sunset}<dt>Daylight</dt><dd>{report.sunrise}–{report.sunset}</dd>{/if}
          {#if report.opacity}<dt>Sky</dt><dd>{report.opacity}</dd>{/if}
          <!-- Loose != null checks: data files built before these fields existed leave them undefined. -->
          {#if report.minGroundTemp != null || report.maxGroundTemp != null}
            <dt>Ground temperature</dt>
            <dd>{report.minGroundTemp != null ? fmtTemp(report.minGroundTemp) : '?'} to {report.maxGroundTemp != null ? fmtTemp(report.maxGroundTemp) : '?'}</dd>
          {/if}
          {#if report.uvIndex}<dt>UV level</dt><dd>{uvText(report.uvIndex)}</dd>{/if}
          {#if report.ls !== null || report.month !== null}
            <dt>Season then</dt>
            <dd>{[report.ls !== null ? `Ls ${report.ls}°` : '', report.month !== null ? `month ${report.month}` : ''].filter(Boolean).join(', ')}</dd>
          {/if}
        </dl>
        <p class="note" data-testid="weather-source">
          {#if !weather}
            Loading weather data…
          {:else if weather.mars.source === 'live' && weather.mars.fetchedAt}
            From NASA's REMS feed, checked {ago(weather.mars.fetchedAt)}.
          {:else if weather.mars.source === 'previous' && weather.mars.fetchedAt}
            NASA's feed was unreachable at the last update; this is from {ago(weather.mars.fetchedAt)}.
          {:else}
            Stored report from {fmtDate.format(new Date(`${STORED_REPORT_CHECKED}T00:00:00Z`))}. NASA's feed couldn't be reached; details are in the browser console.
          {/if}
        </p>
      </div>
    {/if}

    {#if body.id === 'sun' && weather}
      <SolarWindCard data={weather.solarWind} />
    {/if}

    {@render stats(live)}

    {#if body.id !== 'sun' && simMs !== null}
      <SunAndSeasons id={body.id} {simMs} />
    {/if}

    <dl class="stats">
      {#if body.year}<dt>Year</dt><dd>{body.year}</dd>{/if}
      {#if body.day}<dt>Day</dt><dd>{body.day}</dd>{/if}
      <dt>Temperature</dt>
      <dd>{body.temp}</dd>
      {#if body.pressure}<dt>Surface pressure</dt><dd>{body.pressure}</dd>{/if}
      <dt>Radius</dt>
      <dd>{body.radiusKm.toLocaleString('en-US')} km</dd>
    </dl>

    <div class="weather">
      <p class="eyebrow section">Weather</p>
      <ul>
        {#each body.weather as w (w)}<li>{w}</li>{/each}
      </ul>
    </div>
  {/if}
</aside>

{#snippet stats(rows: string[][])}
  <dl class="stats">
    {#each rows as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
  </dl>
{/snippet}

<style>
  .panel {
    position: fixed;
    right: max(16px, env(safe-area-inset-right, 0px));
    top: calc(16px + env(safe-area-inset-top, 0px));
    width: min(340px, calc(100% - 32px));
    max-height: calc(100% - 120px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    padding: 16px 18px 18px;
    display: grid;
    gap: 14px;
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  header .eyebrow {
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  h2 {
    margin: 4px 0 0;
    font: 800 24px/1.1 var(--font-display);
  }

  p {
    margin: 0;
    line-height: 1.5;
  }

  .section {
    margin-bottom: 8px;
  }

  .hint {
    font-size: 12px;
    color: var(--ink-dim);
  }

  .close {
    background: none;
    border: 0;
    color: var(--ink-dim);
    font: 400 22px/1 var(--font-body);
    cursor: pointer;
    padding: 2px 6px;
  }

  .close:hover {
    color: var(--ink);
  }

  .report {
    border: 1px solid rgba(217, 119, 74, 0.45);
    background: rgba(217, 119, 74, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
  }

  .report .eyebrow {
    color: var(--mars);
  }

  .big {
    font: 500 22px/1 var(--font-data);
  }

  .note {
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.45;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin: 0 0 6px;
    line-height: 1.45;
    font-size: 13.5px;
  }

  @media (max-width: 640px) {
    .panel {
      top: auto;
      bottom: calc(132px + env(safe-area-inset-bottom, 0px));
      left: 16px;
      right: 16px;
      width: auto;
      max-height: 46%;
    }
  }
</style>
