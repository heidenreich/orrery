<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_BODIES, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import type { ScaleMode } from '$lib/orrery/scene';

  interface Props {
    selected: BodyId | null;
    playing: boolean;
    daysPerSec: number;
    scale: ScaleMode;
    /** Bump to jump the clock back to the current date. */
    resetToNow: number;
    onselect: (id: BodyId) => void;
    ontick: (simMs: number, positions: PositionsAU) => void;
    /** Playback reached the earliest or latest supported date and stopped. */
    onlimit: () => void;
  }

  let { selected, playing, daysPerSec, scale, resetToNow, onselect, ontick, onlimit }: Props = $props();

  let container: HTMLDivElement;
  const labels: Partial<Record<BodyId, HTMLElement>> = $state({});
  let scene: import('$lib/orrery/scene').OrreryScene | undefined = $state();
  let failed = $state(false);
  let contextLost = $state(false);

  onMount(() => {
    let disposed = false;
    // three.js needs the browser, so load it only on the client.
    import('$lib/orrery/scene')
      .then(({ OrreryScene }) => {
        if (disposed) return;
        scene = new OrreryScene({
          container,
          labels,
          onSelect: (id) => onselect(id),
          onTick: (ms, pos) => ontick(ms, pos),
          onLimit: () => onlimit(),
          onContext: (available) => (contextLost = !available)
        });
        scene.playing = playing;
      })
      .catch((err) => {
        // Usually no WebGL (disabled, or unsupported hardware); the panel and controls still work.
        console.warn('3D view unavailable:', err);
        failed = true;
      });
    return () => {
      disposed = true;
      scene?.destroy();
    };
  });

  $effect(() => {
    if (scene) scene.playing = playing;
  });
  $effect(() => {
    if (scene) scene.daysPerSec = daysPerSec;
  });
  $effect(() => {
    scene?.setScale(scale);
  });
  $effect(() => {
    scene?.select(selected);
  });
  $effect(() => {
    if (scene && resetToNow) scene.simMs = Date.now();
  });
</script>

<div
  class="stage"
  bind:this={container}
  role="img"
  aria-label="3D view of the solar system. Drag to rotate, scroll or pinch to zoom."
></div>

{#if contextLost && !failed}
  <div class="fallback" role="status">
    <p class="eyebrow">3D view paused</p>
    <p>The browser reset its graphics. The view comes back on its own; the panel and controls still work.</p>
  </div>
{/if}

{#if failed}
  <div class="fallback" role="status">
    <p class="eyebrow">3D view unavailable</p>
    <p>
      This browser couldn't start WebGL, which the 3D view needs. Turning on hardware acceleration usually fixes it.
      You can still choose a world from the World menu.
    </p>
  </div>
{/if}

<div class="labels">
  {#each ALL_BODIES as b (b.id)}
    <button
      type="button"
      class="label"
      class:active={selected === b.id}
      bind:this={labels[b.id]}
      hidden
      onclick={() => onselect(b.id)}
    >
      {b.name}
    </button>
  {/each}
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
  }

  .stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  .fallback {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: var(--void);
    width: min(360px, calc(100% - 32px));
    box-sizing: border-box;
    display: grid;
    gap: 8px;
    padding: 16px 18px;
    border: 1px dashed var(--panel-line);
    border-radius: 14px;
    color: var(--ink-dim);
  }

  .fallback p {
    margin: 0;
    line-height: 1.5;
  }

  /* On phones the panel fills the lower half, so sit the message just under the header. */
  @media (max-width: 640px) {
    .fallback {
      top: calc(96px + env(safe-area-inset-top, 0px));
      transform: translateX(-50%);
    }
  }

  .labels {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .label {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: auto;
    font: 500 12px/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
    background: none;
    border: 0;
    /* Larger hit area than the text itself. */
    padding: 7px 8px;
    cursor: pointer;
    white-space: nowrap;
    text-shadow:
      0 0 6px var(--void),
      0 0 2px var(--void);
  }

  .label:hover {
    color: var(--ink);
  }

  .label.active {
    color: var(--sun);
  }
</style>
