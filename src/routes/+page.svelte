<script lang="ts">
  import { onMount } from 'svelte';
  import InfoPanel from '$lib/components/InfoPanel.svelte';
  import Orrery from '$lib/components/Orrery.svelte';
  import { planetPositions, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import { marsSolDate, VALID_YEARS } from '$lib/orrery/orbits';
  import type { ScaleMode } from '$lib/orrery/scene';

  const SPEEDS = [
    { value: 1, label: '1 day / s' },
    { value: 10, label: '10 days / s' },
    { value: 60, label: '2 months / s' },
    { value: 365, label: '1 year / s' },
    { value: -10, label: '−10 days / s' }
  ];

  let selected: BodyId | null = $state(null);
  let playing = $state(false);
  let daysPerSec = $state(10);
  let scale: ScaleMode = $state('compressed');
  let resetToNow = $state(0);
  // Null until the page runs in the browser, so the prerendered HTML never carries the build date.
  let simMs: number | null = $state(null);
  let positions: PositionsAU | null = $state(null);

  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const year = $derived(simMs === null ? null : new Date(simMs).getUTCFullYear());
  const outOfRange = $derived(year !== null && (year < VALID_YEARS.from || year > VALID_YEARS.to));

  onMount(() => {
    simMs = Date.now();
    // Seed positions so the panel has distances even if the 3D view never starts.
    positions = planetPositions(simMs);
    playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') selected = null;
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      playing = !playing;
    }
  }
</script>

<svelte:head>
  <title>Solar System Orrery</title>
  <meta name="description" content="Interactive 3D solar system with real planet positions and the latest Mars weather." />
</svelte:head>

<svelte:window {onkeydown} />

<Orrery
  {selected}
  {playing}
  {daysPerSec}
  {scale}
  {resetToNow}
  onselect={(id) => (selected = id)}
  ontick={(ms, pos) => {
    simMs = ms;
    positions = pos;
  }}
/>

<div class="hud">
  <h1>Solar System <span>Orrery</span></h1>
  <div class="clock" data-testid="clock">
    {#if simMs !== null}
      {fmtDate.format(new Date(simMs))}
      <small>Mars Sol Date {Math.floor(marsSolDate(simMs)).toLocaleString('en-US')}</small>
    {:else}
      &nbsp;<small>&nbsp;</small>
    {/if}
  </div>
  {#if outOfRange}
    <div class="chip">Outside {VALID_YEARS.from}–{VALID_YEARS.to}: positions are approximate</div>
  {/if}
</div>

<InfoPanel {selected} {simMs} {positions} onclose={() => (selected = null)} />

<div class="controls surface" role="toolbar" aria-label="Time and view controls">
  <button class="ctl" aria-pressed={playing} onclick={() => (playing = !playing)}>
    {playing ? 'Pause' : 'Play'}
  </button>
  <select class="ctl" aria-label="Playback speed" bind:value={daysPerSec}>
    {#each SPEEDS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
  </select>
  <button class="ctl" onclick={() => resetToNow++}>Today</button>
  <span class="grow"></span>
  <span class="ctl-label" id="scale-label">Distances</span>
  <div class="seg" role="group" aria-labelledby="scale-label">
    <button class="ctl" aria-pressed={scale === 'compressed'} onclick={() => (scale = 'compressed')}>Compressed</button>
    <button class="ctl" aria-pressed={scale === 'true'} onclick={() => (scale = 'true')}>True</button>
  </div>
  <button class="ctl" onclick={() => (selected = null)}>Overview</button>
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
