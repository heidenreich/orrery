<script lang="ts">
  import { auroraWords, KP_MAX_AGE_HOURS, kpWords, stormLevel } from '$lib/data/kp';
  import type { KpData } from '$lib/data/weather-data';

  let { data, now }: { data: KpData; now: number } = $props();

  const fmtStart = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const fmtEnd = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  /** "14 Oct, 15:00–18:00 UTC" */
  const period = (iso: string) => `${fmtStart.format(new Date(iso))}–${fmtEnd.format(new Date(Date.parse(iso) + 3 * 3_600_000))} UTC`;
  const W = 220, H = 48, MAX = 9;
  /** Kp covers the 3 hours after its time tag; age counts from the end of that interval. */
  const ageHours = $derived(data.summary ? (now - Date.parse(data.summary.latest.time)) / 3_600_000 - 3 : 0);
  const stale = $derived(ageHours > KP_MAX_AGE_HOURS);
  const level = (kp: number) => (stormLevel(kp) ? 'storm' : kp >= 4 ? 'active' : 'quiet');

  // One bar per 3-hour interval over the last three days, on the full 0–9 scale.
  const bars = $derived.by(() => {
    const pts = data.summary?.series ?? [];
    if (pts.length < 2) return null;
    const w = W / pts.length;
    const peak = pts.reduce((a, b) => (b.kp > a.kp ? b : a));
    return {
      w,
      peak,
      items: pts.map((p, i) => {
        const h = Math.max(1.5, (p.kp / MAX) * H);
        return { x: i * w + 0.5, y: H - h, h, cls: level(p.kp), key: p.time };
      })
    };
  });
</script>

{#if data.summary}
  {@const k = data.summary.latest}
  <div class="card" data-testid="kp">
    <p class="eyebrow">Space weather at Earth</p>
    <div class="big">Kp {k.kp.toFixed(k.kp % 1 ? 1 : 0)} <span class="level {level(k.kp)}">{kpWords(k.kp)}</span></div>
    {#if bars}
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Kp index for the last three days, peaking at {bars.peak.kp.toFixed(1)}">
        <line class="g1" x1="0" x2={W} y1={H - (5 / MAX) * H} y2={H - (5 / MAX) * H} />
        {#each bars.items as b (b.key)}<rect class={b.cls} x={b.x} y={b.y} width={Math.max(1, bars.w - 1)} height={b.h} rx="1" />{/each}
      </svg>
      <p class="range">Last 3 days, every 3 hours. The line marks Kp 5, where storms begin. Peak: Kp {bars.peak.kp.toFixed(1)}.</p>
    {/if}
    <p class="aurora">{auroraWords(k.kp)}</p>
    <dl class="stats">
      <dt>Covers</dt>
      <dd>{period(k.time)}</dd>
    </dl>
    <p class="note">
      NOAA's planetary K-index: how disturbed Earth's magnetic field is, from 0 (calm) to 9 (extreme storm).
      {#if data.source === 'previous'}NOAA was unreachable at the last update, so this is the previous value.{/if}
    </p>
    {#if stale}
      <p class="stale" role="status">This value is {Math.round(ageHours)} hours old, so it may not reflect conditions now.</p>
    {/if}
  </div>
{/if}

<style>
  .card {
    border: 1px solid rgba(127, 178, 236, 0.4);
    background: rgba(127, 178, 236, 0.07);
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
  }

  .card .eyebrow {
    color: var(--earth);
  }

  .big {
    font: 500 22px/1 var(--font-data);
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .level {
    font: 500 13px/1 var(--font-body);
  }

  svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .g1 {
    stroke: var(--mars);
    stroke-width: 0.75;
    stroke-dasharray: 3 3;
    opacity: 0.7;
  }

  rect.quiet {
    fill: var(--earth);
  }

  rect.active,
  .level.active {
    fill: var(--warn);
    color: var(--warn);
  }

  rect.storm,
  .level.storm {
    fill: var(--mars);
    color: var(--mars);
  }

  .level.quiet {
    color: var(--earth);
  }

  .aurora {
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
