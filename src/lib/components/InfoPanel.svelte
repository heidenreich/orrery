<script lang="ts">
  import { tick } from 'svelte';
  import SolarWindCard from '$lib/components/SolarWindCard.svelte';
  import SunAndSeasons from '$lib/components/SunAndSeasons.svelte';
  import { ago, celsius, km, lightTime, seasonWords } from '$lib/format';
  import { STORED_MARS_REPORT } from '$lib/data/mars-report';
  import type { WeatherData } from '$lib/data/weather-data';
  import { bodyById, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import { distance, length, marsSolDate } from '$lib/orrery/orbits';

  interface Props {
    selected: BodyId | null;
    simMs: number | null;
    positions: PositionsAU | null;
    /** Null while the data file is loading. */
    weather: WeatherData | null;
    /** The actual current time (ms), refreshed by the page, for "N min ago" text. */
    now: number;
    onclose: () => void;
  }

  let { selected, simMs, positions, weather, now, onclose }: Props = $props();

  const report = $derived(weather?.mars.report ?? STORED_MARS_REPORT);
  // Show the feed's wording in sentence case, with any underscores as spaces.
  const uvText = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };
  const range = (lo: number | null | undefined, hi: number | null | undefined) =>
    `${lo != null ? celsius(lo) : '?'} to ${hi != null ? celsius(hi) : '?'}`;

  const body = $derived(selected ? bodyById(selected) : null);
  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const reportAge = $derived(ago(`${report.earthDate}T12:00:00Z`, now));

  const fmtAU = (au: number) => `${au.toFixed(au < 10 ? 3 : 2)} AU`;

  // Distances for the selected body, or Mars on the overview.
  const live = $derived.by(() => {
    if (!positions || simMs === null) return [];
    const earth = positions.earth;
    const id = selected ?? 'mars';
    if (id === 'sun') {
      const d = length(earth);
      return [['From Earth', `${fmtAU(d)} · ${km(d)}`], ['Sunlight takes', lightTime(d)]];
    }
    const p = positions[id];
    const rows: [string, string][] = [['From the Sun', fmtAU(length(p))]];
    if (id !== 'earth') {
      const d = distance(p, earth);
      rows.push(['From Earth', `${fmtAU(d)} · ${km(d)}`], ['Radio signal takes', lightTime(d)]);
    }
    return rows;
  });

  // Each time the selection changes: back to the top, and move focus to the new heading so
  // keyboard and screen reader users land on what they picked.
  let panel: HTMLElement;
  let heading: HTMLElement | undefined = $state();
  let more = $state(false);
  const checkMore = () => {
    if (panel) more = panel.scrollHeight - panel.scrollTop - panel.clientHeight > 8;
  };
  $effect(() => {
    void selected;
    tick().then(() => {
      if (!panel) return;
      panel.scrollTop = 0;
      checkMore();
      if (selected) heading?.focus({ preventScroll: true });
    });
  });
  $effect(() => {
    // Content changes (data arriving, live values) can change whether there is more to scroll.
    void weather;
    void simMs;
    checkMore();
  });
</script>

<aside class="panel surface" aria-label="Details" bind:this={panel} onscroll={checkMore} data-label-avoid>
  {#if !body}
    <header>
      <div>
        <p class="eyebrow">Solar system</p>
        <h2>Pick a world</h2>
      </div>
    </header>
    <p>
      Positions, distances, sunlight and seasons are calculated for the date shown. Mars shows the latest
      weather report from NASA's Curiosity rover, and the Sun shows live solar wind.
    </p>
    <p class="hint">Choose from the World menu or click a planet. Drag to rotate, scroll or pinch to zoom.</p>
    <div>
      <p class="eyebrow section">Mars right now</p>
      {@render stats(live)}
    </div>
  {:else}
    <header>
      <div>
        <p class="eyebrow">{body.kind}</p>
        <h2 tabindex="-1" bind:this={heading}>{body.name}</h2>
      </div>
      <button class="close" aria-label="Close {body.name} and return to the overview" onclick={onclose}>×</button>
    </header>

    {#if body.id === 'mars'}
      <div class="report">
        <p class="eyebrow">Curiosity weather report</p>
        <div class="big">{fmtDate.format(new Date(`${report.earthDate}T00:00:00Z`))}</div>
        <p class="sub">{reportAge} · mission sol {report.sol} at Gale Crater</p>
        <dl class="stats">
          {#if report.minTemp !== null || report.maxTemp !== null}
            <dt>Air temperature</dt>
            <dd>{range(report.minTemp, report.maxTemp)}</dd>
          {/if}
          <!-- Loose != null checks: data files built before these fields existed leave them undefined. -->
          {#if report.minGroundTemp != null || report.maxGroundTemp != null}
            <dt>Ground temperature</dt>
            <dd>{range(report.minGroundTemp, report.maxGroundTemp)}</dd>
          {/if}
          {#if report.pressure !== null}<dt>Pressure</dt><dd>{report.pressure.toLocaleString('en-US')} Pa</dd>{/if}
          {#if report.sunrise && report.sunset}<dt>Daylight</dt><dd>{report.sunrise}–{report.sunset}</dd>{/if}
          {#if report.opacity}<dt>Sky</dt><dd>{report.opacity}</dd>{/if}
          {#if report.uvIndex}<dt>UV level</dt><dd>{uvText(report.uvIndex)}</dd>{/if}
          {#if report.ls !== null}<dt>Season then</dt><dd>{seasonWords(report.ls)}</dd>{/if}
        </dl>
        <p class="note" data-testid="weather-source">
          {#if !weather}
            Loading weather data…
          {:else if weather.mars.source === 'live' && weather.mars.fetchedAt}
            From NASA's REMS feed, checked {ago(weather.mars.fetchedAt, now)}. Curiosity's reports usually
            appear weeks after the sol they describe.
          {:else if weather.mars.source === 'previous' && weather.mars.fetchedAt}
            NASA's feed couldn't be reached at the last update, so this is the copy fetched
            {ago(weather.mars.fetchedAt, now)}.
          {:else}
            NASA's feed couldn't be reached, so this is a saved copy of the latest report.
          {/if}
        </p>
      </div>
    {/if}

    {#if body.id === 'sun'}
      {#if weather?.solarWind.summary}
        <SolarWindCard data={weather.solarWind} {now} />
      {:else if weather}
        <p class="empty" data-testid="solar-wind-empty">Live solar wind readings are unavailable right now.</p>
      {/if}
    {/if}

    {@render stats(live)}

    {#if body.id === 'mars' && simMs !== null}
      <dl class="stats">
        <dt title="Days counted on Mars since 29 December 1873, the Mars equivalent of a calendar date">Mars Sol Date</dt>
        <dd>{Math.floor(marsSolDate(simMs)).toLocaleString('en-US')}</dd>
      </dl>
    {/if}

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
  <div class="more" class:show={more} aria-hidden="true">More below ↓</div>
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
    padding: 16px 18px 0;
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

  h2:focus {
    outline: none;
  }

  h2:focus-visible {
    outline: 2px solid var(--sun);
    outline-offset: 4px;
  }

  p {
    margin: 0;
    line-height: 1.5;
  }

  .section {
    margin-bottom: 8px;
  }

  .hint {
    font-size: 12.5px;
    color: var(--ink-dim);
  }

  .close {
    background: none;
    border: 0;
    color: var(--ink-dim);
    font: 400 24px/1 var(--font-body);
    cursor: pointer;
    min-width: 40px;
    min-height: 40px;
    margin: -8px -10px 0 0;
    border-radius: 8px;
  }

  .close:hover {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.06);
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

  .sub {
    margin-top: -2px;
    font-size: 12.5px;
    color: var(--ink-dim);
  }

  .note,
  .empty {
    font-size: 12.5px;
    color: var(--ink-dim);
    line-height: 1.45;
  }

  .empty {
    border: 1px dashed var(--panel-line);
    border-radius: 10px;
    padding: 12px 14px;
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

  /* Sticks to the bottom edge while there is more to scroll. */
  .more {
    position: sticky;
    bottom: 0;
    margin: 0 -18px;
    padding: 18px 18px 10px;
    text-align: center;
    font: 500 11.5px/1 var(--font-body);
    letter-spacing: 0.06em;
    color: var(--ink-dim);
    background: linear-gradient(to bottom, transparent, var(--panel-solid) 60%);
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  .more.show {
    opacity: 1;
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

  @media (prefers-reduced-motion: reduce) {
    .more {
      transition: none;
    }
  }
</style>
