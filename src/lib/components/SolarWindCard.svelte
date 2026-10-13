<script lang="ts">
  import type { SolarWindData } from '$lib/data/weather-data';

  let { data }: { data: SolarWindData } = $props();

  const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
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
      <dd>{fmtTime.format(new Date(s.time))} by {s.source}</dd>
    </dl>
    <p class="note">
      NOAA real-time solar wind, measured upstream of Earth.
      {#if data.source === 'previous'}NOAA was unreachable at the last update, so this is the previous reading.{/if}
    </p>
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

  .range,
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.45;
  }
</style>
