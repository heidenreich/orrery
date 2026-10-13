<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_BODIES, type BodyId } from '$lib/orrery/bodies';
  import type { PositionsAU, ScaleMode } from '$lib/orrery/scene';

  interface Props {
    selected: BodyId | null;
    playing: boolean;
    daysPerSec: number;
    scale: ScaleMode;
    /** Bump to jump the clock back to the current date. */
    resetToNow: number;
    onselect: (id: BodyId) => void;
    ontick: (simMs: number, positions: PositionsAU) => void;
  }

  let { selected, playing, daysPerSec, scale, resetToNow, onselect, ontick }: Props = $props();

  let container: HTMLDivElement;
  const labels: Partial<Record<BodyId, HTMLElement>> = $state({});
  let scene: import('$lib/orrery/scene').OrreryScene | undefined = $state();

  onMount(() => {
    let disposed = false;
    // three.js needs the browser, so load it only on the client.
    import('$lib/orrery/scene').then(({ OrreryScene }) => {
      if (disposed) return;
      scene = new OrreryScene({
        container,
        labels,
        onSelect: (id) => onselect(id),
        onTick: (ms, pos) => ontick(ms, pos)
      });
      scene.playing = playing;
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
    font: 500 11px/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-dim);
    background: none;
    border: 0;
    padding: 4px 6px;
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
