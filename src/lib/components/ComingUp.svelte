<script lang="ts">
  import { untrack } from 'svelte';
  import type { SpacecraftData } from '$lib/data/spacecraft-data';
  import type { WorldId } from '$lib/orrery/craft';
  import { upcomingEvents, type SkyEvent } from '$lib/orrery/events';

  let {
    simMs,
    spacecraft,
    onjump
  }: { simMs: number; spacecraft: SpacecraftData | null; onjump: (ms: number, focus: WorldId | null) => void } = $props();

  const DAY = 86_400_000;
  // From the clock's day, so it follows the clock. Finding the events takes about 10 ms, and in
  // fast playback the day changes every frame, so refresh at most twice a second.
  const clockDay = $derived(Math.floor(simMs / DAY));
  // Starts at the clock's day; the effect below keeps it following.
  let day = $state(untrack(() => Math.floor(simMs / DAY)));
  let lastRefresh = 0;
  $effect(() => {
    const d = clockDay;
    if (d === day) return;
    const wait = Math.max(0, lastRefresh + 500 - Date.now());
    const t = setTimeout(() => {
      lastRefresh = Date.now();
      day = d;
    }, wait);
    return () => clearTimeout(t);
  });
  const events = $derived(upcomingEvents(day * DAY, 120, spacecraft));
  let all = $state(false);
  // From the clock's moment, not the start of its day: nothing that has already happened.
  const ahead = $derived(events.filter((e) => e.ms >= simMs || (e.approximate && e.ms >= day * DAY)));
  const shown = $derived(all ? ahead : ahead.slice(0, 3));

  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const when = (e: SkyEvent) => {
    // Whole UTC days from the clock's day, so 20:50 tonight is "today", not "tomorrow".
    const days = Math.floor(e.ms / DAY) - day;
    const rel = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : days < 60 ? `in ${days} days` : `in ${Math.round(days / 30.44)} months`;
    const at = e.approximate || e.kind === 'flyby' ? '' : `, ${fmtTime.format(new Date(e.ms))} UTC`;
    return `${e.approximate ? 'around ' : ''}${fmtDate.format(new Date(e.ms))}${at} · ${rel}`;
  };
</script>

<section class="coming" data-testid="coming-up" aria-labelledby="coming-heading">
  <p class="eyebrow" id="coming-heading">Coming up</p>
  <ol>
    {#each shown as e (e.ms + e.title)}
      <li>
        <button type="button" onclick={() => onjump(e.ms, e.focus)} aria-label="{e.title}, {when(e)}: set the clock to then">
          <span class="title">{e.title}</span>
          <span class="when">{when(e)}</span>
        </button>
        <span class="detail">{e.detail}</span>
      </li>
    {/each}
  </ol>
  {#if ahead.length > 3}
    <button type="button" class="more" aria-expanded={all} onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${ahead.length} in the next four months`}</button>
  {/if}
  <p class="note">Pick one to set the clock to that moment. Dates are UTC; meteor shower peaks shift by a day or so each year.</p>
</section>

<style>
  .coming {
    display: grid;
    gap: 8px;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  li {
    display: grid;
    gap: 2px;
  }

  li button {
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 8px;
    color: var(--ink);
  }

  .title {
    font: 600 13.5px/1.35 var(--font-body);
    text-decoration: underline;
    text-decoration-color: var(--panel-line);
    text-underline-offset: 3px;
  }

  li button:hover .title {
    text-decoration-color: currentColor;
  }

  .when {
    font: 400 12px/1.35 var(--font-data);
    color: var(--ink-dim);
  }

  .detail,
  .note {
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-dim);
  }

  .note {
    margin: 0;
  }

  .more {
    justify-self: start;
    background: none;
    border: 1px solid var(--panel-line);
    border-radius: 999px;
    color: var(--ink);
    font: 500 12.5px/1 var(--font-body);
    padding: 8px 12px;
    cursor: pointer;
  }
</style>
