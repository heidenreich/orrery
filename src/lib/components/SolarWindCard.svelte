<script lang="ts">
  import { SOLAR_WIND_MAX_AGE_HOURS } from '$lib/data/solar-wind';
  import type { SolarWindData } from '$lib/data/weather-data';
  import { ago } from '$lib/format';

  let { data, now }: { data: SolarWindData; now: number } = $props();

  const fmtWhen = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
  });
  const ageHours = $derived(data.summary ? (now - Date.parse(data.summary.latest.time)) / 3_600_000 : 0);
  const stale = $derived(ageHours > SOLAR_WIND_MAX_AGE_HOURS);
  const W = 220, H = 44;

  const chart = $derived.by(() => {
    const pts = data.summary?.series ?? [];
    if (pts.length < 2) return null;
    const speeds = pts.map((p) => p.speed);
    const lo = Math.min(...speeds), hi = Math.max(...speeds);
    const span = hi - lo || 1;
    const t0 = Date.parse(pts[0].time), t1 = Date.parse(pts[pts.length - 1].time);
    const x = (t: string) => ((Date.parse(t) - t0) / (t1 - t0 || 1)) * W;
    const y = (s: number) => H - 4 - ((s - lo) / span) * (H - 8);
    const line = pts.map((p) => `${x(p.time).toFixed(1)},${y(p.speed).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    return { line, lo, hi, endX: x(last.time), endY: y(last.speed) };
  });
</script>

{#if data.summary}
  {@const s = data.summary.latest}
  <div class="card" data-testid="solar-wind">
    <p class="eyebrow">Solar wind at Earth</p>
    <div class="big">{Math.round(s.speed)} km/s</div>
    {#if chart}
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Solar wind speed over the last 24 hours, {Math.round(chart.lo)} to {Math.round(chart.hi)} km/s">
        <polyline points={chart.line} />
        <circle cx={chart.endX} cy={chart.endY} r="2.5" />
      </svg>
      <p class="range">Last 24 h: {Math.round(chart.lo)}–{Math.round(chart.hi)} km/s</p>
    {/if}
    <dl class="stats">
      {#if s.density !== null}<dt>Density</dt><dd>{s.density.toFixed(1)} protons/cm³</dd>{/if}
      {#if s.temperature !== null}<dt>Temperature</dt><dd>{Math.round(s.temperature).toLocaleString('en-US')} K</dd>{/if}
      <dt>Measured</dt>
      <dd>{fmtWhen.format(new Date(s.time))} ({ago(s.time, now)}) by {s.source}</dd>
    </dl>
    <p class="note">
      NOAA real-time solar wind, measured upstream of Earth.
      {#if data.source === 'previous'}NOAA was unreachable at the last update, so this is the previous reading.{/if}
    </p>
    {#if stale}
      <p class="stale" role="status">This reading is {Math.round(ageHours)} hours old, so it may not reflect conditions now.</p>
    {/if}
  </div>
{/if}

<style>
  .card {
    border: 1px solid rgba(240, 182, 90, 0.4);
    background: rgba(240, 182, 90, 0.07);
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
  }

  .card .eyebrow {
    color: var(--sun);
  }

  .big {
    font: 500 22px/1 var(--font-data);
  }

  svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  polyline {
    fill: none;
    stroke: var(--sun);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  circle {
    fill: var(--sun);
  }

  .stale {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--warn);
  }

  .range,
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.45;
  }
</style>
