<script lang="ts">
  import { tick } from 'svelte';
  import MarsHistory from '$lib/components/MarsHistory.svelte';
  import FlareCard from '$lib/components/FlareCard.svelte';
  import KpCard from '$lib/components/KpCard.svelte';
  import SolarWindCard from '$lib/components/SolarWindCard.svelte';
  import SunAndSeasons from '$lib/components/SunAndSeasons.svelte';
  import { ago, celsius, km, lightTime, seasonWords } from '$lib/format';
  import { STORED_MARS_REPORT } from '$lib/data/mars-report';
  import type { WeatherData } from '$lib/data/weather-data';
  import { ALL_BODIES, bodyById, type BodyId, type PositionsAU } from '$lib/orrery/bodies';
  import { distance, length, marsSolDate } from '$lib/orrery/orbits';
  import { FACTS, MOONS_CHECKED, gravityText, massText } from '$lib/orrery/facts';
  import { northSeason } from '$lib/orrery/seasons';
  import { craftById, isCraftId, type WorldId } from '$lib/orrery/craft';
  import { moonsOf } from '$lib/orrery/moons';
  import { AU_PER_DAY_KMS, craftState, FLYBY_AU, trackEnd, type SpacecraftData } from '$lib/data/spacecraft-data';

  interface Props {
    selected: WorldId | null;
    simMs: number | null;
    positions: PositionsAU | null;
    /** Null while the data file is loading. */
    weather: WeatherData | null;
    /** Spacecraft trajectories; null until loaded or when unavailable. */
    spacecraft: SpacecraftData | null;
    /** The actual current time (ms), refreshed by the page, for "N min ago" text. */
    now: number;
    /** `fromKeyboard`: closed with Enter or Space rather than a click or tap. */
    onclose: (fromKeyboard: boolean) => void;
    onselect: (id: BodyId) => void;
  }

  let { selected, simMs, positions, weather, spacecraft, now, onclose, onselect }: Props = $props();

  const report = $derived(weather?.mars.report ?? STORED_MARS_REPORT);
  // Show the feed's wording in sentence case, with any underscores as spaces.
  const uvText = (s: string) => { const t = s.replace(/_/g, ' ').toLowerCase(); return t[0].toUpperCase() + t.slice(1); };
  const range = (lo: number | null | undefined, hi: number | null | undefined) =>
    `${lo != null ? celsius(lo) : '?'} to ${hi != null ? celsius(hi) : '?'}`;

  const bodyId = $derived(selected && !isCraftId(selected) ? selected : null);
  const body = $derived(bodyId ? bodyById(bodyId) : null);
  const facts = $derived(bodyId ? FACTS[bodyId] : null);
  // Moons drawn in the 3D view for this planet (Titan and Triton only once their data is in).
  const shownMoons = $derived(
    bodyId && bodyId !== 'sun'
      ? moonsOf(bodyId).filter((m) => m.source === 'astronomy-engine' || spacecraft?.moons.some((t) => t.id === m.id))
      : []
  );
  const listWords = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

  // The selected spacecraft, and where it is at the clock's time.
  const craft = $derived(selected && isCraftId(selected) ? craftById(selected) : null);
  const track = $derived(craft ? (spacecraft?.craft.find((t) => t.id === craft.id) ?? null) : null);
  const craftNow = $derived(track && simMs !== null ? craftState(track, simMs) : null);
  const craftRows = $derived.by(() => {
    if (!craftNow || !positions) return [];
    const p = craftNow.pos, v = craftNow.vel;
    const d = distance(p, positions.earth);
    const rough = d < FLYBY_AU;
    return [
      ['From the Sun', `${fmtAU(length(p))} · ${km(length(p))}`],
      ['From Earth', rough ? `about ${km(d)}, approximate during this Earth flyby` : `${fmtAU(d)} · ${km(d)}`],
      ['Radio signal takes', rough ? `about ${lightTime(d)}` : lightTime(d)],
      ['Speed', `${(length(v) * AU_PER_DAY_KMS).toFixed(1)} km/s relative to the Sun`]
    ];
  });
  const fmtDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const reportAge = $derived(ago(`${report.earthDate}T12:00:00Z`, now));

  const fmtAU = (au: number) => `${au.toFixed(au < 10 ? 3 : 2)} AU`;

  // One row per body for the overview: distance from Earth and what is happening there now.
  const overview = $derived.by(() => {
    if (!positions || simMs === null) return [];
    const earth = positions.earth;
    return ALL_BODIES.map((b) => {
      if (b.id === 'sun') {
        const wind = weather?.solarWind.summary?.latest.speed;
        return { id: b.id, name: b.name, from: fmtAU(length(earth)), now: wind != null ? `Wind ${Math.round(wind)} km/s` : '—' };
      }
      const season = northSeason(b.id, simMs);
      return {
        id: b.id,
        name: b.name,
        from: b.id === 'earth' ? '—' : fmtAU(distance(positions[b.id], earth)),
        now: season ? `Northern ${season}` : 'No seasons'
      };
    });
  });

  // Distances for the selected body.
  const live = $derived.by(() => {
    if (!positions || simMs === null || !bodyId) return [];
    const earth = positions.earth;
    const id = bodyId;
    if (id === 'sun') {
      const d = length(earth);
      return [['From Earth', `${fmtAU(d)} · ${km(d)}`], ['Sunlight takes', lightTime(d)]];
    }
    const p = positions[id];
    const rows: [string, string][] = [['From the Sun', fmtAU(length(p))]];
    if (id !== 'earth') {
      const d = distance(p, earth);
      rows.push(['From Earth', `${fmtAU(d)} · ${km(d)}`], ['Radio signal takes', lightTime(d)]);
    }
    return rows;
  });

  // On phones the panel is a bottom sheet over the 3D view. The overview starts folded down to its
  // heading so the solar system has the screen; picking a world opens it. (Wider screens ignore this.)
  let folded = $state(true);
  $effect(() => {
    folded = selected === null;
  });

  // Each time the selection changes: back to the top, and move focus to the new heading so
  // keyboard and screen reader users land on what they picked.
  let panel: HTMLElement;
  let heading: HTMLElement | undefined = $state();
  let more = $state(false);
  const checkMore = () => {
    if (panel) more = panel.scrollHeight - panel.scrollTop - panel.clientHeight > 8;
  };
  $effect(() => {
    void selected;
    tick().then(() => {
      if (!panel) return;
      panel.scrollTop = 0;
      checkMore();
      // Not when the choice came from a menu: arrow keys in a closed <select> change it at once
      // in some browsers, and taking focus would stop the user stepping through the list. The
      // page's live region announces the selection either way.
      if (selected && !(document.activeElement instanceof HTMLSelectElement)) heading?.focus({ preventScroll: true });
    });
  });
  $effect(() => {
    // Content changes (data arriving, live values) can change whether there is more to scroll.
    void weather;
    void simMs;
    checkMore();
  });
</script>

{#snippet fold(what: string)}
  <button class="fold" type="button" aria-expanded={!folded} onclick={() => (folded = !folded)}>
    {folded ? `Show ${what}` : 'Hide'}
  </button>
{/snippet}

<aside
  class="panel surface"
  class:folded
  aria-label="Details"
  bind:this={panel}
  onscroll={checkMore}
  data-label-avoid
  data-view-avoid
>
  {#if craft}
    <header>
      <div>
        <p class="eyebrow">Spacecraft · {craft.agency}</p>
        <h2 tabindex="-1" bind:this={heading}>{craft.name}</h2>
      </div>
      <div class="actions">
        {@render fold('details')}
        <button class="close" aria-label="Close {craft.name} and return to the overview" onclick={(e) => onclose(e.detail === 0)}>×</button>
      </div>
    </header>
    {#if craftNow}
      {@render stats(craftRows)}
    {:else if track}
      <p class="empty" data-testid="craft-out-of-range">
        Its trajectory here runs from {fmtDate.format(new Date(track.start))} to {fmtDate.format(new Date(trackEnd(track)))}.
        Set the clock inside those dates to see where it was.
        {#if typeof craft.from !== 'string'}This site keeps only about {Math.round((craft.from.daysBack + craft.daysAhead) / 30)} months
          of its path around today, sampled finely enough to follow it.{/if}
      </p>
    {/if}
    <dl class="stats">
      <dt>Launched</dt><dd>{fmtDate.format(new Date(`${craft.launched}T00:00:00Z`))}</dd>
    </dl>
    <div class="weather">
      <p class="eyebrow section">Mission</p>
      <ul>
        {#each craft.about as a (a)}<li>{a}</li>{/each}
      </ul>
    </div>
    {#if track}
      <p class="note" data-testid="craft-source">
        Trajectory from NASA JPL's Horizons system, fetched {ago(track.fetchedAt, now)}{track.source === 'previous'
          ? ' (Horizons was unreachable at the last update, so this is the previous copy)'
          : ''}.{#if craft.model}
          3D model from <a href="https://github.com/nasa/NASA-3D-Resources" rel="noopener" target="_blank">NASA 3D Resources</a>,
          drawn far larger than life and pointed as the real one points ({craft.model.toward === 'sun'
            ? 'heat shield to the Sun'
            : 'dish to Earth'}).{/if}
      </p>
    {/if}
  {:else if !body}
    <header>
      <div>
        <p class="eyebrow">Solar system</p>
        <h2>Pick a world</h2>
      </div>
      {@render fold('worlds')}
    </header>
    <p>
      Where every planet is, how far away, how much sunlight it gets and what season it is, for the date
      shown. Three worlds have live data: the solar wind at the Sun, space
      weather and auroras at Earth, and the latest weather report from NASA's Curiosity rover on Mars.
    </p>
    <table class="worlds" data-testid="worlds">
      <caption class="eyebrow">Worlds right now</caption>
      <thead>
        <tr><th scope="col">World</th><th scope="col">From Earth</th><th scope="col">Now</th></tr>
      </thead>
      <tbody>
        {#each overview as row (row.id)}
          <tr>
            <th scope="row"><button type="button" onclick={() => onselect(row.id)}>{row.name}</button></th>
            <td>{row.from}</td>
            <td>{row.now}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="hint">Choose a world here, from the World menu, or by clicking it. Drag to rotate, scroll or pinch to zoom.</p>
    <p class="credit" data-testid="texture-credit">
      Planet, Moon and Sun images by <a href="https://www.solarsystemscope.com/textures/" rel="noopener" target="_blank">Solar System Scope</a>,
      based on NASA data, under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener" target="_blank">CC BY 4.0</a>.
    </p>
  {:else}
    <header>
      <div>
        <p class="eyebrow">{body.kind}</p>
        <h2 tabindex="-1" bind:this={heading}>{body.name}</h2>
      </div>
      <div class="actions">
        {@render fold('details')}
        <button class="close" aria-label="Close {body.name} and return to the overview" onclick={(e) => onclose(e.detail === 0)}>×</button>
      </div>
    </header>

    {#if body.id === 'mars'}
      <div class="report">
        <p class="eyebrow">Curiosity weather report</p>
        <div class="big">{fmtDate.format(new Date(`${report.earthDate}T00:00:00Z`))}</div>
        <p class="sub">{reportAge} · mission sol {report.sol} at Gale Crater</p>
        <dl class="stats">
          {#if report.minTemp !== null || report.maxTemp !== null}
            <dt>Air temperature</dt>
            <dd>{range(report.minTemp, report.maxTemp)}</dd>
          {/if}
          <!-- Loose != null checks: data files built before these fields existed leave them undefined. -->
          {#if report.minGroundTemp != null || report.maxGroundTemp != null}
            <dt>Ground temperature</dt>
            <dd>{range(report.minGroundTemp, report.maxGroundTemp)}</dd>
          {/if}
          {#if report.pressure !== null}<dt>Pressure</dt><dd>{report.pressure.toLocaleString('en-US')} Pa</dd>{/if}
          {#if report.sunrise && report.sunset}<dt>Daylight (local)</dt><dd>{report.sunrise}–{report.sunset}</dd>{/if}
          {#if report.opacity}<dt>Sky</dt><dd>{report.opacity}</dd>{/if}
          {#if report.uvIndex}<dt>UV level</dt><dd>{uvText(report.uvIndex)}</dd>{/if}
          {#if report.ls !== null}<dt>Season on that sol</dt><dd>{seasonWords(report.ls)}</dd>{/if}
        </dl>
        {#if weather?.mars.history.length}<MarsHistory history={weather.mars.history} />{/if}
        <p class="note" data-testid="weather-source">
          {#if !weather}
            Loading weather data…
          {:else if weather.mars.source === 'live' && weather.mars.fetchedAt}
            From NASA's REMS feed, checked {ago(weather.mars.fetchedAt, now)}. Curiosity's reports usually
            appear weeks after the sol they describe.
          {:else if weather.mars.source === 'previous' && weather.mars.fetchedAt}
            NASA's feed couldn't be reached at the last update, so this is the copy fetched
            {ago(weather.mars.fetchedAt, now)}.
          {:else}
            NASA's feed couldn't be reached, so this is a saved copy of the latest report.
          {/if}
        </p>
      </div>
    {/if}

    {#if body.id === 'sun'}
      {#if weather?.solarWind.summary}
        <SolarWindCard data={weather.solarWind} {now} />
      {:else if weather}
        <p class="empty" data-testid="solar-wind-empty">Live solar wind readings are unavailable right now.</p>
      {/if}
      {#if weather?.xray.summary}
        <FlareCard data={weather.xray} {now} />
      {:else if weather}
        <p class="empty" data-testid="flares-empty">Live solar flare readings are unavailable right now.</p>
      {/if}
    {/if}

    {#if body.id === 'earth'}
      {#if weather?.kp.summary}
        <KpCard data={weather.kp} {now} />
      {:else if weather}
        <p class="empty" data-testid="kp-empty">Live space weather readings for Earth are unavailable right now.</p>
      {/if}
    {/if}

    {@render stats(live)}

    {#if body.id === 'mars' && simMs !== null}
      <dl class="stats">
        <dt title="Days counted on Mars since 29 December 1873, the Mars equivalent of a calendar date">Mars Sol Date</dt>
        <dd>{Math.floor(marsSolDate(simMs)).toLocaleString('en-US')}</dd>
      </dl>
    {/if}

    {#if body.id !== 'sun' && simMs !== null}
      <SunAndSeasons id={body.id} {simMs} />
    {/if}

    <dl class="stats">
      {#if body.year}<dt>Year</dt><dd>{body.year}</dd>{/if}
      {#if body.day}<dt>Day</dt><dd>{body.day}</dd>{/if}
      <dt>Temperature</dt>
      <dd>{body.temp}</dd>
      {#if body.pressure}<dt>Surface pressure</dt><dd>{body.pressure}</dd>{/if}
      <dt>Radius</dt>
      <dd>{body.radiusKm.toLocaleString('en-US')} km</dd>
      {#if facts}
        <dt>Mass</dt><dd>{massText(facts.massEarths)}</dd>
        <dt>Gravity</dt><dd>{gravityText(facts.gravity)}</dd>
        <dt>Escape velocity</dt><dd>{facts.escapeKms} km/s</dd>
        <dt>Density</dt><dd>{facts.density} g/cm³{body.id === 'saturn' ? ', less than water' : ''}</dd>
        {#if facts.moons}<dt>Moons</dt><dd>{facts.moons.count === '0' ? 'None' : facts.moons.count}</dd>{/if}
      {/if}
    </dl>


    <div class="weather">
      <p class="eyebrow section">Weather</p>
      <ul>
        {#each body.weather as w (w)}<li>{w}</li>{/each}
      </ul>
    </div>

    {#if facts}
      <div class="about" data-testid="facts">
        <section>
          <p class="eyebrow section">{body.id === 'sun' ? 'Made of' : 'Atmosphere'}</p>
          <p>{facts.atmosphere}</p>
        </section>
        {#if facts.moons?.notable}
          <section>
            <p class="eyebrow section">Moons</p>
            <p>
              {facts.moons.count === '1' ? 'One moon' : `${facts.moons.count} known moons`}{facts.moons.count.endsWith('+')
                ? ` as of ${MOONS_CHECKED}, and new small ones keep turning up`
                : ''}. {facts.moons.notable}.
            </p>
            {#if shownMoons.length}
              <p class="note" data-testid="moons-shown">
                In the 3D view: {listWords(shownMoons.map((m) => m.id === 'moon' ? 'the Moon' : m.name))}, in {shownMoons.length > 1
                  ? 'their'
                  : 'its'} real direction from {body.name}. Distances are compressed so {shownMoons.length > 1 ? 'they fit' : 'it fits'}
                beside the planet, which is drawn far larger than life.
              </p>
            {/if}
          </section>
        {/if}
        {#if facts.rings}
          <section>
            <p class="eyebrow section">Rings</p>
            <p>{facts.rings}.</p>
          </section>
        {/if}
        {#if facts.visited}
          <section>
            <p class="eyebrow section">Visited by</p>
            <p>{facts.visited}.</p>
          </section>
        {/if}
      </div>
    {/if}
  {/if}
  <div class="more" class:show={more} aria-hidden="true">More below ↓</div>
</aside>

{#snippet stats(rows: string[][])}
  <dl class="stats">
    {#each rows as [k, v] (k)}<dt>{k}</dt><dd>{v}</dd>{/each}
  </dl>
{/snippet}

<style>
  .panel {
    position: fixed;
    right: max(16px, env(safe-area-inset-right, 0px));
    top: calc(16px + env(safe-area-inset-top, 0px));
    width: min(340px, calc(100% - 32px));
    max-height: calc(100% - 120px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    padding: 16px 18px 0;
    display: grid;
    gap: 14px;
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  header .eyebrow {
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  h2 {
    margin: 4px 0 0;
    font: 800 24px/1.1 var(--font-display);
  }

  h2:focus {
    outline: none;
  }

  h2:focus-visible {
    outline: 2px solid var(--sun);
    outline-offset: 4px;
  }

  p {
    margin: 0;
    line-height: 1.5;
  }

  .section {
    margin-bottom: 8px;
  }

  .worlds {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .worlds caption {
    text-align: left;
    margin-bottom: 6px;
  }

  .worlds th,
  .worlds td {
    padding: 0;
    text-align: left;
    font-weight: 400;
    border-top: 1px solid var(--panel-line);
  }

  .worlds thead th {
    border-top: 0;
    padding: 0 0 4px;
    font-size: 11.5px;
    color: var(--ink-dim);
  }

  .worlds td {
    padding: 7px 0;
    font: 400 12.5px/1.2 var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--ink-dim);
  }

  .worlds td:last-child,
  .worlds thead th:last-child {
    text-align: right;
    font-family: var(--font-body);
  }

  .worlds tbody th button {
    width: 100%;
    padding: 7px 8px 7px 0;
    text-align: left;
    font: 500 13.5px/1.2 var(--font-body);
    color: var(--ink);
    background: none;
    border: 0;
    cursor: pointer;
  }

  .worlds tbody th button:hover {
    color: var(--sun);
  }

  .hint {
    font-size: 12.5px;
    color: var(--ink-dim);
  }

  .credit {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--ink-dim);
  }

  .note a,
  .credit a {
    color: inherit;
    text-underline-offset: 2px;
  }

  .credit a:hover {
    color: var(--ink);
  }

  .about {
    display: grid;
    gap: 12px;
  }

  .about p {
    margin: 0;
    line-height: 1.5;
  }

  .about .eyebrow {
    margin-bottom: 4px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Only phones fold the panel. */
  .fold {
    display: none;
    background: none;
    border: 1px solid var(--panel-line);
    border-radius: 999px;
    color: var(--ink);
    font: 500 13px/1 var(--font-body);
    padding: 9px 14px;
    min-height: 36px;
    cursor: pointer;
    white-space: nowrap;
    align-self: center;
  }

  .close {
    background: none;
    border: 0;
    color: var(--ink-dim);
    font: 400 24px/1 var(--font-body);
    cursor: pointer;
    min-width: 40px;
    min-height: 40px;
    margin: -8px -10px 0 0;
    border-radius: 8px;
  }

  .close:hover {
    color: var(--ink);
    background: rgba(255, 255, 255, 0.06);
  }

  .report {
    border: 1px solid rgba(217, 119, 74, 0.45);
    background: rgba(217, 119, 74, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
    display: grid;
    gap: 8px;
  }

  .report .eyebrow {
    color: var(--mars);
  }

  .big {
    font: 500 22px/1 var(--font-data);
  }

  .sub {
    margin-top: -2px;
    font-size: 12.5px;
    color: var(--ink-dim);
  }

  .note,
  .empty {
    font-size: 12.5px;
    color: var(--ink-dim);
    line-height: 1.45;
  }

  .empty {
    border: 1px dashed var(--panel-line);
    border-radius: 10px;
    padding: 12px 14px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin: 0 0 6px;
    line-height: 1.45;
    font-size: 13.5px;
  }

  /* Sticks to the bottom edge while there is more to scroll. */
  .more {
    position: sticky;
    bottom: 0;
    margin: 0 -18px;
    padding: 18px 18px 10px;
    text-align: center;
    font: 500 11.5px/1 var(--font-body);
    letter-spacing: 0.06em;
    color: var(--ink-dim);
    background: linear-gradient(to bottom, transparent, var(--panel-solid) 60%);
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  .more.show {
    opacity: 1;
  }

  @media (max-width: 640px) {
    .fold {
      display: block;
    }

    .panel.folded {
      padding-bottom: 14px;
      overflow: hidden;
    }

    .panel.folded > :not(header) {
      display: none;
    }

    .panel {
      top: auto;
      /* Just above the toolbar, whose height the page measures (it wraps to two rows here). */
      bottom: calc(var(--toolbar-h, 116px) + 24px + env(safe-area-inset-bottom, 0px));
      left: 16px;
      right: 16px;
      width: auto;
      max-height: 46%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .more {
      transition: none;
    }
  }
</style>
