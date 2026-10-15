<script lang="ts">
  import type { SpacecraftData } from '$lib/data/spacecraft-data';
  import type { WeatherData } from '$lib/data/weather-data';
  import type { WorldId } from '$lib/orrery/craft';
  import { todayLines } from '$lib/orrery/today';

  let { weather, spacecraft, now, onselect }: { weather: WeatherData | null; spacecraft: SpacecraftData | null; now: number; onselect: (id: WorldId) => void } =
    $props();

  // Recomputed once a minute: the Moon's phase and Voyager's distance change slowly.
  const minute = $derived(Math.floor(now / 60_000));
  const lines = $derived(todayLines(minute * 60_000, weather, spacecraft));
  const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
</script>

<section class="today" data-testid="today" aria-labelledby="today-heading">
  <p class="eyebrow" id="today-heading">Solar system today · {fmtDay.format(new Date(minute * 60_000))}</p>
  <ul>
    {#each lines as l (l.label)}
      <li>
        <button type="button" onclick={() => onselect(l.focus)}>{l.label}</button>
        <span>{l.text}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .today {
    border: 1px solid var(--panel-line);
    border-radius: 10px;
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 5px;
  }

  li {
    display: grid;
    grid-template-columns: 76px 1fr;
    align-items: start;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;
  }

  button {
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink);
    font: 600 13px/1.4 var(--font-body);
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--panel-line);
    text-underline-offset: 3px;
  }

  button:hover {
    text-decoration-color: currentColor;
  }

  span {
    color: var(--ink-dim);
  }
</style>
