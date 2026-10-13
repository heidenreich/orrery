<script lang="ts">
  import type { PlanetId } from '$lib/orrery/bodies';
  import { seasons, SOLAR_CONSTANT, SPIN_TILT, sunlight } from '$lib/orrery/seasons';

  let { id, simMs }: { id: PlanetId; simMs: number } = $props();

  const light = $derived(sunlight(id, simMs));
  const season = $derived(seasons(id, simMs));

  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

  function number(w: number) {
    if (w >= 10_000) return (w / 1000).toFixed(1);
    if (w >= 100) return Math.round(w).toLocaleString('en-US');
    return w.toFixed(w < 10 ? 1 : 0);
  }
  const unit = (w: number) => (w >= 10_000 ? 'kW/m²' : 'W/m²');
  const watts = (w: number) => `${number(w)} ${unit(w)}`;
  const range = (lo: number, hi: number) =>
    unit(lo) === unit(hi) ? `${number(lo)}–${number(hi)} ${unit(hi)}` : `${watts(lo)} to ${watts(hi)}`;

  function share(fraction: number) {
    if (fraction >= 1.5) return `${fraction.toFixed(1)}× Earth's`;
    if (fraction >= 0.95) return `about Earth's`;
    if (fraction >= 0.01) return `${Math.round(fraction * 100)}% of Earth's`;
    return `1/${Math.round(1 / fraction).toLocaleString('en-US')} of Earth's`;
  }

  function until(ms: number) {
    const days = (ms - simMs) / 86_400_000;
    if (days < 1) return 'within a day';
    if (days < 60) return `in ${Math.round(days)} days`;
    const months = days / 30.44;
    if (months < 24) return `in ${Math.round(months)} months`;
    return `in ${Math.round(days / 365.25)} years`;
  }

  const latitude = (deg: number) => `${Math.abs(deg).toFixed(1)}° ${deg >= 0 ? 'N' : 'S'}`;
  const tiltText = $derived(SPIN_TILT[id] ? `${SPIN_TILT[id]}°, so it spins backwards` : `${season.tilt.toFixed(1)}°`);
</script>

<div class="sun-seasons" data-testid="sun-seasons">
  <p class="eyebrow">Sun and seasons</p>
  <dl class="stats">
    <dt>Sunlight</dt>
    <dd>{watts(light.now)} · {share(light.relativeToEarth)}</dd>
    <dt>Over its orbit</dt>
    <dd>{range(light.min, light.max)}</dd>
    {#if season.seasonal}
      <dt>Season</dt>
      <dd>{cap(season.north)} in the north, {season.south} in the south</dd>
      <dt>Sun overhead at</dt>
      <dd>{latitude(season.subsolarLatitude)}</dd>
      <dt>Solar longitude</dt>
      <dd>Ls {season.ls.toFixed(1)}°</dd>
      <dt>Next</dt>
      <dd>{cap(season.next.name)}, {fmtDate.format(new Date(season.next.ms))} ({until(season.next.ms)})</dd>
      <dt>Each season lasts</dt>
      <dd>
        {season.seasonDays >= 730 ? `about ${Math.round(season.seasonDays / 365.25)} years` : `about ${Math.round(season.seasonDays)} days`} on average
      </dd>
    {:else}
      <dt>Seasons</dt>
      <dd>Barely any: axis tilted {tiltText}</dd>
    {/if}
  </dl>
  <p class="note">
    Sunlight at the top of the atmosphere, from distance to the Sun ({SOLAR_CONSTANT.toLocaleString('en-US')} W/m² at 1 AU).
    Seasons from the planet's pole direction (IAU). Both follow the date shown.
  </p>
</div>

<style>
  .sun-seasons {
    display: grid;
    gap: 8px;
  }

  .note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
    line-height: 1.45;
  }
</style>
