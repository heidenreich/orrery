<script lang="ts">
  import type { XrayData } from '$lib/data/weather-data';
  import { flareClass, flareWords, radioBlackout, XRAY_MAX_AGE_HOURS } from '$lib/data/xray';
  import { ago } from '$lib/format';

  let { data, now }: { data: XrayData; now: number } = $props();

  const fmtWhen = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const BLACKOUTS = ['', 'minor', 'moderate', 'strong', 'severe', 'extreme'];
  const ageHours = $derived(data.summary ? (now - Date.parse(data.summary.latest.time)) / 3_600_000 : 0);
  const stale = $derived(ageHours > XRAY_MAX_AGE_HOURS);

  // Flux on a log scale from mid-A (10^-8.5) to X (10^-3.5), with the class thresholds marked.
  const W = 220, H = 60, LO = -8.5, HI = -3.5;
  const y = (flux: number) => H - ((Math.min(HI, Math.max(LO, Math.log10(flux))) - LO) / (HI - LO)) * H;
  const thresholds = [['C', 1e-6], ['M', 1e-5], ['X', 1e-4]] as const;

  const chart = $derived.by(() => {
    const pts = data.summary?.series ?? [];
    if (pts.length < 2) return null;
    const t0 = Date.parse(pts[0].time), t1 = Date.parse(pts[pts.length - 1].time);
    const x = (t: string) => ((Date.parse(t) - t0) / (t1 - t0 || 1)) * W;
    const line = pts.map((p) => `${x(p.time).toFixed(1)},${y(p.flux).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    return { line, endX: x(last.time), endY: y(last.flux) };
  });
</script>

{#if data.summary}
  {@const s = data.summary}
  {@const blackout = radioBlackout(s.peak.flux)}
  <div class="card" data-testid="flares">
    <p class="eyebrow">Solar flares</p>
    <div class="big">{flareClass(s.latest.flux)} <span class="words">{flareWords(s.latest.flux)}</span></div>
    {#if chart}
      <svg
        viewBox="0 0 {W} {H}"
        role="img"
        aria-label="Solar X-ray brightness over the last 24 hours, peaking at class {flareClass(s.peak.flux)}"
      >
        {#each thresholds as [label, flux] (label)}
          <line x1="0" x2={W} y1={y(flux)} y2={y(flux)} />
          <text x={W + 4} y={y(flux) + 3}>{label}</text>
        {/each}
        <polyline points={chart.line} />
        <circle cx={chart.endX} cy={chart.endY} r="2.5" />
      </svg>
      <p class="range">Last 24 h of X-rays, on a log scale: each line is ten times brighter than the one below.</p>
    {/if}
    <dl class="stats">
      <dt>24 h peak</dt>
      <dd>{flareClass(s.peak.flux)} at {fmtWhen.format(new Date(s.peak.time))} UTC</dd>
      <dt>Measured</dt>
      <dd>{ago(s.latest.time, now)}{s.latest.satellite ? ` by GOES-${s.latest.satellite}` : ''}</dd>
    </dl>
    {#if blackout}
      <p class="effect">
        The {flareClass(s.peak.flux)} peak rates R{blackout} ({BLACKOUTS[blackout]}) on NOAA's radio blackout scale: flares
        this strong can make high-frequency radio fade on Earth's daylit side.
      </p>
    {/if}
    <p class="note">
      GOES satellites measure the Sun's X-rays; flares are named by their peak: A, B and C are small, M moderate, X major.
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
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .words {
    font: 500 13px/1.2 var(--font-body);
    color: var(--ink-dim);
  }

  svg {
    width: calc(100% - 14px);
    height: auto;
    overflow: visible;
  }

  line {
    stroke: var(--panel-line);
    stroke-width: 0.75;
    stroke-dasharray: 3 3;
  }

  text {
    fill: var(--ink-dim);
    font: 500 8px var(--font-data);
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

  .effect {
    margin: 0;
    line-height: 1.5;
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
