<script lang="ts">
  import { onMount, tick } from 'svelte';
  import InfoPanel from '$lib/components/InfoPanel.svelte';
  import { resolve } from '$app/paths';
  import { loadWeather } from '$lib/data/weather';
  import type { WeatherData } from '$lib/data/weather-data';
  import Orrery from '$lib/components/Orrery.svelte';
  import { ALL_BODIES, bodyById, planetPositions, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import type { ScaleMode } from '$lib/orrery/scene';
  import { LIVE_TOLERANCE_MS, REAL_TIME, SIM_MAX_MS, SIM_MIN_MS } from '$lib/orrery/time';

  const SPEEDS = [
    { value: REAL_TIME, label: 'Real time' },
    { value: 1, label: '1 day / s' },
    { value: 10, label: '10 days / s' },
    { value: 60, label: '2 months / s' },
    { value: 365, label: '1 year / s' },
    { value: -10, label: '−10 days / s' }
  ];

  let selected: BodyId | null = $state(null);
  let playing = $state(true);
  let daysPerSec = $state(REAL_TIME);
  const SITE_URL = 'https://heidenreich.github.io/orrery';
  const DESCRIPTION =
    'Interactive 3D solar system: real planet positions, distances, sunlight and seasons, with live solar wind and Mars weather.';

  let scale: ScaleMode = $state('compressed');
  let resetToNow = $state(0);
  // Null until the page runs in the browser, so the prerendered HTML never carries the build date.
  let simMs: number | null = $state(null);
  let positions: PositionsAU | null = $state(null);
  let weather: WeatherData | null = $state(null);

  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const year = $derived(simMs === null ? null : new Date(simMs).getUTCFullYear());
  const atLimit = $derived(simMs !== null && (simMs <= SIM_MIN_MS || simMs >= SIM_MAX_MS));

  // The actual time, refreshed every second, to tell whether the clock shows now.
  let now = $state(Date.now());
  let lastTick = 0;
  const status = $derived(
    !playing ? 'Paused'
      : daysPerSec === REAL_TIME && simMs !== null && Math.abs(simMs - now) < LIVE_TOLERANCE_MS ? 'Live'
      : 'Simulated'
  );

  function goLive() {
    daysPerSec = REAL_TIME;
    playing = true;
    resetToNow++;
  }

  /** "3 days", "5 months", "1.2 years" between the clock and now, when simulated. */
  const offset = $derived.by(() => {
    if (simMs === null || status === 'Live') return '';
    const days = (simMs - now) / 86_400_000;
    const abs = Math.abs(days);
    if (abs < 1) return '';
    const size = abs < 60 ? `${Math.round(abs)} days` : abs < 730 ? `${Math.round(abs / 30.44)} months` : `${(abs / 365.25).toFixed(1)} years`;
    return days > 0 ? `${size} ahead` : `${size} ago`;
  });

  // One place that says what is selected, for screen readers.
  const announcement = $derived(selected ? `${bodyById(selected).name} selected` : 'Overview');

  let picker: HTMLSelectElement;
  // Keyboard users get focus back on the World menu. Not after a tap or click: focusing a
  // <select> from script makes iOS Safari pop its picker open.
  async function closePanel(fromKeyboard: boolean) {
    selected = null;
    await tick();
    if (fromKeyboard) picker?.focus();
  }

  onMount(() => {
    simMs = Date.now();
    // Seed positions so the panel has distances even if the 3D view never starts.
    positions = planetPositions(simMs);
    loadWeather(resolve('/data/weather.json')).then((w) => (weather = w));
    const timer = setInterval(() => {
      now = Date.now();
      // Without the 3D scene nothing else advances the clock, so keep live mode live here.
      if (now - lastTick > 2000 && playing && daysPerSec === REAL_TIME) {
        simMs = now;
        positions = planetPositions(now);
      }
    }, 1000);
    return () => clearInterval(timer);
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && selected) closePanel(true);
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      playing = !playing;
    }
  }
</script>

<svelte:head>
  <title>Solar System Orrery</title>
  <meta name="description" content={DESCRIPTION} />
  <!-- Link previews need absolute URLs, so these name the deployed site. -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE_URL}/" />
  <meta property="og:title" content="Solar System Orrery" />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:image" content="{SITE_URL}/og.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Saturn in the 3D view, with its panel of distances, sunlight and seasons" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<svelte:window {onkeydown} />

<Orrery
  {selected}
  {playing}
  {daysPerSec}
  {scale}
  {resetToNow}
  onselect={(id) => (selected = id)}
  onlimit={() => (playing = false)}
  ontick={(ms, pos) => {
    lastTick = Date.now();
    simMs = ms;
    positions = pos;
  }}
/>

<p class="sr-only" aria-live="polite">{announcement}</p>

<div class="hud" data-label-avoid>
  <h1>Solar System <span>Orrery</span></h1>
  <div class="clock" data-testid="clock">
    {#if simMs !== null}
      <span class="when">
        {fmtDate.format(new Date(simMs))} · {fmtTime.format(new Date(simMs))} UTC
        <span class="status" class:live={status === 'Live'} class:sim={status !== 'Live'} data-testid="clock-status">{status}</span>
      </span>
      {#if offset}<small data-testid="clock-offset">{offset} from today</small>{/if}
    {:else}
      &nbsp;
    {/if}
  </div>
  {#if scale === 'true'}
    <p class="caption">Distances to scale (planets are still drawn larger than life): the inner planets crowd close to the Sun. Zoom in to see them.</p>
  {/if}
  {#if atLimit}
    <div class="chip" role="status">Stopped at the year {year}: the clock runs from 1000 to 3000</div>
  {/if}
</div>

<InfoPanel {selected} {simMs} {positions} {weather} {now} onclose={closePanel} onselect={(id) => (selected = id)} />

<div class="controls surface" role="toolbar" aria-label="Time and view controls" data-label-avoid>
  <select
    class="ctl"
    name="world"
    aria-label="World"
    bind:this={picker}
    value={selected ?? ''}
    onchange={(e) => (selected = (e.currentTarget.value || null) as BodyId | null)}
  >
    <option value="">Overview</option>
    {#each ALL_BODIES as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
  </select>
  <button class="ctl play" onclick={() => (playing = !playing)}>
    <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
    {playing ? 'Pause' : 'Play'}
  </button>
  <select class="ctl" name="speed" aria-label="Playback speed" bind:value={daysPerSec} onchange={() => (playing = true)}>
    {#each SPEEDS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
  </select>
  <button class="ctl" onclick={goLive} disabled={status === 'Live'}>Now</button>
  <span class="grow"></span>
  <span class="ctl-label" id="scale-label">Distances</span>
  <div class="seg" role="group" aria-labelledby="scale-label">
    <button
      class="ctl"
      aria-pressed={scale === 'compressed'}
      title="Distances squeezed so every planet fits on screen"
      onclick={() => (scale = 'compressed')}>Compressed</button
    >
    <button
      class="ctl"
      aria-pressed={scale === 'true'}
      title="Distances to scale. Planets are still drawn much larger than life"
      onclick={() => (scale = 'true')}>To scale</button
    >
  </div>
</div>

<style>
  .hud {
    position: fixed;
    left: max(16px, env(safe-area-inset-left, 0px));
    top: calc(16px + env(safe-area-inset-top, 0px));
    display: grid;
    gap: 6px;
    pointer-events: none;
  }

  h1 {
    margin: 0;
    font: 800 clamp(20px, 3.2vw, 30px)/1 var(--font-display);
    letter-spacing: 0.01em;
    text-wrap: balance;
  }

  h1 span {
    color: var(--sun);
  }

  .clock {
    font: 500 13px/1.4 var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }

  .status {
    font: 600 10px/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
    border: 1px solid var(--panel-line);
    border-radius: 99px;
    padding: 3px 7px;
  }

  .status.live {
    color: var(--live);
    border-color: color-mix(in srgb, var(--live) 50%, transparent);
  }

  .status.live::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 50%;
    background: var(--live);
    vertical-align: 1px;
  }

  .status.sim {
    color: var(--ink);
    border-color: var(--sun);
  }

  .caption {
    margin: 0;
    max-width: 30ch;
    font: 400 12.5px/1.4 var(--font-body);
    color: var(--ink-dim);
  }

  .play {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .play span {
    font-size: 0.8em;
  }

  .clock small {
    display: block;
    color: var(--ink-dim);
    font-size: 11px;
  }

  .chip {
    justify-self: start;
    font: 500 11px/1 var(--font-body);
    letter-spacing: 0.04em;
    color: var(--void);
    background: var(--warn);
    padding: 4px 8px;
    border-radius: 99px;
  }

  .controls {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    width: min(720px, calc(100% - 32px));
    box-sizing: border-box;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 12px;
  }

  .grow {
    flex: 1 1 auto;
  }

  .ctl-label {
    font: 500 11px/1 var(--font-body);
    color: var(--ink-dim);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--panel-line);
    border-radius: 9px;
    overflow: hidden;
  }

  .seg .ctl {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .seg .ctl[aria-pressed='true'] {
    background: var(--sun);
  }

  .seg .ctl + .ctl {
    border-left: 1px solid var(--panel-line);
  }

  select.ctl option {
    background: #141a2c;
    color: var(--ink);
  }

  @media (max-width: 640px) {
    h1 {
      font-size: 20px;
    }
  }
</style>
