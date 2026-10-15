<script lang="ts">
  import type { SpacecraftData } from '$lib/data/spacecraft-data';
  import type { WeatherData } from '$lib/data/weather-data';
  import type { WorldId } from '$lib/orrery/craft';
  import { readingsFetchedAt, todayLines } from '$lib/orrery/today';
  import { ago } from '$lib/format';

  let { weather, spacecraft, now, onselect }: { weather: WeatherData | null; spacecraft: SpacecraftData | null; now: number; onselect: (id: WorldId) => void } =
    $props();

  // Recomputed once a minute: Voyager's distance changes slowly.
  const minute = $derived(Math.floor(now / 60_000));
  const lines = $derived(todayLines(minute * 60_000, weather, spacecraft));
  // The reader's own date, not UTC's, which is already tomorrow in Asia and the Pacific.
  const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const fetched = $derived(readingsFetchedAt(weather, minute * 60_000));
</script>

<section class="today" data-testid="today" aria-labelledby="today-heading">
  <p class="eyebrow" id="today-heading">Solar system today · {fmtDay.format(new Date(minute * 60_000))}</p>
  {#if !weather}
    <!-- The page always ends up with weather data (the bundled report at worst), so null is loading. -->
    <p class="note">Loading the latest readings…</p>
  {:else if lines.length === 0}
    <p class="note">The latest readings from the Sun, Earth and Mars aren’t available right now.</p>
  {:else}
  <ul>
    {#each lines as l (l.label)}
      <li>
        <button type="button" onclick={() => onselect(l.focus)}>{l.label}</button>
        <span>{l.text}</span>
      </li>
    {/each}
  </ul>
  {/if}
  {#if fetched}
    <p class="note" data-testid="today-age">Sun and Earth readings from NOAA, updated hourly; {fetched.feeds > 1 ? 'the oldest of these was' : 'this was'} fetched {ago(fetched.at, now)}.</p>
  {/if}
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
    grid-template-columns: 6.5em 1fr;
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
    min-height: 24px;
  }

  button:hover {
    text-decoration-color: currentColor;
  }

  span {
    color: var(--ink-dim);
  }

  .note {
    margin: 0;
    font-size: 12px;
    color: var(--ink-dim);
  }
</style>
