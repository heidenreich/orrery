<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldId } from '$lib/orrery/craft';
  import { brightness, compass, height, moonAt, roundPlace, tonightSky, whenAndWhere, type Place } from '$lib/orrery/tonight';

  let { now, onselect }: { now: number; onselect: (id: WorldId) => void } = $props();

  const KEY = 'orrery.place';
  let place = $state<Place | null>(null);
  let status = $state('');
  let locating = $state(false);
  let lat = $state(''), lon = $state('');

  // The place is kept in this browser only, rounded to 0.1°, so it is there next visit.
  onMount(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) place = p;
    } catch {
      // Storage blocked or bad data: ask again.
    }
  });

  function save(p: Place | null) {
    place = p && roundPlace(p);
    try {
      if (place) localStorage.setItem(KEY, JSON.stringify(place));
      else localStorage.removeItem(KEY);
    } catch {
      // Not remembered, which is fine.
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      status = 'This browser can’t share a location. Enter one below instead.';
      return;
    }
    locating = true;
    status = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        save({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        locating = false;
        status = err.code === err.PERMISSION_DENIED ? 'Location access was declined. Enter one below instead.' : 'Couldn’t find your location. Enter one below instead.';
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 3_600_000 }
    );
  }

  function enter(e: SubmitEvent) {
    e.preventDefault();
    const la = Number(lat), lo = Number(lon);
    if (lat.trim() === '' || lon.trim() === '' || !(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180)) {
      status = 'Latitude runs from −90 to 90 and longitude from −180 to 180 (east is positive).';
      return;
    }
    status = '';
    save({ latitude: la, longitude: lo });
  }

  // About 10 ms to work out, so every 10 minutes is plenty.
  const slot = $derived(Math.floor(now / 600_000) * 600_000);
  const sky = $derived(place ? tonightSky(slot, place) : null);

  const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  // Times are in this device's time zone; say so when the place is far from it (an entered place).
  const offsetH = -new Date().getTimezoneOffset() / 60;
  const farAway = $derived(place ? Math.abs((((place.longitude / 15 - offsetH + 12) % 24) + 24) % 24 - 12) > 2.5 : false);
  const t = (ms: number) => fmtTime.format(new Date(ms));
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? pos : neg}`;
  // Without a place there is no dusk to work from, so this is the Moon now.
  const moonNow = $derived(moonAt(slot));
</script>

<section class="tonight" data-testid="tonight" aria-labelledby="tonight-heading">
  <p class="eyebrow" id="tonight-heading">Tonight’s sky{place ? ` · ${deg(place.latitude, 'N', 'S')}, ${deg(place.longitude, 'E', 'W')}` : ''}</p>
  {#if !place}
    <p class="lead">The Moon now: {moonNow.phase.toLowerCase()}, {moonNow.lit}% lit. Share a place to see which planets you can spot, where to look and when.</p>
    <button type="button" class="primary" onclick={locate} disabled={locating}>{locating ? 'Finding you…' : 'Use my location'}</button>
    <details>
      <summary>Or enter a place</summary>
      <form onsubmit={enter}>
        <label>Latitude <input name="latitude" inputmode="decimal" placeholder="51.5" bind:value={lat} /></label>
        <label>Longitude <input name="longitude" inputmode="decimal" placeholder="−0.1" bind:value={lon} /></label>
        <button type="submit">Show</button>
      </form>
    </details>
    {#if status}<p class="status" role="status">{status}</p>{/if}
    <p class="note">Your location stays in this browser, rounded to about 10 km.</p>
  {:else if sky}
    {#if !sky.dark}
      <p class="lead">
        {sky.polar === 'midnight-sun'
          ? 'The Sun doesn’t set here tonight: it’s the midnight sun, so the planets are lost in daylight.'
          : 'The Sun sets, but never far enough for the sky to get dark here tonight, so the planets are lost in the twilight.'}
      </p>
    {:else}
      <p class="lead">
        {#if sky.polar === 'polar-night'}Polar night: the Sun doesn’t rise here today.
        {:else if sky.startsNow}Bright planets show now, until {t(sky.dark.to)}; fainter ones need the darker hours.
        {:else}Bright planets show from {t(sky.dark.from)}, in twilight, until {t(sky.dark.to)}; fainter ones need the darker hours.{/if}
        Times are in your time zone{zone ? ` (${zone})` : ''}{farAway ? ', not local time there' : ''}.
      </p>
      <ul>
        {#each sky.visible as o (o.id)}
          <li>
            <button type="button" onclick={() => onselect(o.id === 'moon' ? 'earth' : o.id)} aria-label={o.id === 'moon' ? 'Moon: open Earth and the Moon' : undefined}>{o.name}</button>
            <span>
              {o.id === 'moon' ? `${sky.moon.phase}, ${sky.moon.lit}% lit.` : `${cap(brightness(o.magnitude))}.`}
              {whenAndWhere(o, t, sky)}
            </span>
          </li>
        {:else}
          <li class="none">No planets are clear of the horizon after dark tonight.</li>
        {/each}
      </ul>
      {#if sky.optics.length}
        <p class="note optics" data-testid="tonight-optics">
          With binoculars, from a dark site:
          {#each sky.optics as o, i (o.id)}{i ? '; ' : ' '}<button type="button" class="link" onclick={() => onselect(o.id as WorldId)}>{o.name}</button>, {height(o.best.altitude)} in the {compass(o.best.azimuth)} around {t(o.best.ms)}{/each}.
        </p>
      {/if}
      {#if !sky.visible.some((o) => o.id === 'moon')}<p class="note">The Moon ({sky.moon.phase.toLowerCase()}) isn’t up after dark tonight.</p>{/if}
      {#if sky.washedOut.length}<p class="note">Up only while the sky is still too bright: {sky.washedOut.join(', ')}.</p>{/if}
      {#if sky.hidden.length}<p class="note">Not visible tonight: {sky.hidden.join(', ')}, too close to the Sun or below the horizon.</p>{/if}
    {/if}
    <p class="note">
      Visible means at least 10° above the horizon, clear of most trees and buildings, with the sky dark
      enough for that object.
    </p>
    <button type="button" class="link change" onclick={() => save(null)}>Change place</button>
  {/if}
</section>

<style>
  .tonight {
    border: 1px solid var(--panel-line);
    border-radius: 10px;
    padding: 10px 12px;
    display: grid;
    gap: 8px;
    justify-items: start;
  }

  .tonight > * {
    justify-self: stretch;
  }

  .lead,
  .note,
  .status {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
  }

  .note {
    color: var(--ink-dim);
    font-size: 12px;
  }

  .status {
    color: var(--ink);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  li {
    display: grid;
    grid-template-columns: 76px 1fr;
    align-items: start;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;
  }

  li.none {
    display: block;
    color: var(--ink-dim);
  }

  li button,
  .link {
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

  .link {
    font-size: 12px;
    font-weight: 500;
  }

  /* Comfortable touch targets for the text buttons, without changing how the text reads. */
  li button,
  .link {
    min-height: 24px;
  }

  .optics .link {
    padding: 4px 0;
  }

  .change {
    justify-self: start;
    font-size: 13px;
    padding: 4px 0;
  }

  li button:hover,
  .link:hover {
    text-decoration-color: currentColor;
  }

  li span {
    color: var(--ink-dim);
  }

  .primary,
  form button {
    justify-self: start;
    background: var(--ink);
    color: var(--void);
    border: 0;
    border-radius: 8px;
    padding: 7px 12px;
    font: 600 13px/1.2 var(--font-body);
    cursor: pointer;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  summary {
    font-size: 13px;
    cursor: pointer;
    color: var(--ink-dim);
  }

  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px;
    margin-top: 8px;
  }

  label {
    display: grid;
    gap: 3px;
    font-size: 12px;
    color: var(--ink-dim);
  }

  input {
    width: 90px;
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--panel-line);
    border-radius: 6px;
    padding: 5px 7px;
    font: 14px var(--font-body);
  }
</style>
