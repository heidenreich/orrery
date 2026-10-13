<script lang="ts">
  import { LATEST_MARS_REPORT as report } from '$lib/data/mars-report';
  import { bodyById, type BodyId } from '$lib/orrery/bodies';
  import { distance, length, marsSolDate } from '$lib/orrery/orbits';
  import type { PositionsAU } from '$lib/orrery/scene';

  interface Props {
    selected: BodyId | null;
    simMs: number;
    positions: PositionsAU | null;
    onclose: () => void;
  }

  let { selected, simMs, positions, onclose }: Props = $props();

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
    if (!positions) return [];
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
          <dt>Solar longitude</dt>
          <dd>Ls {report.ls}°</dd>
          <dt>Mars month</dt>
          <dd>{report.month} of 12</dd>
        </dl>
        <p class="note">From NASA's REMS feed. Fixed for now; the scheduled fetch will keep it current.</p>
      </div>
    {/if}

    {@render stats(live)}

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
