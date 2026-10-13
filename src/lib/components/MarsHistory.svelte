<script lang="ts">
  import type { MarsHistoryPoint } from '$lib/data/rems';
  import { celsius } from '$lib/format';

  let { history }: { history: MarsHistoryPoint[] } = $props();

  const W = 220, H = 52;

  // Daily highs and lows as separate lines, broken wherever a reading is missing. A reading with
  // gaps on both sides becomes a dot, so it isn't lost.
  const chart = $derived.by(() => {
    const valid = history.filter((h) => h.minTemp !== null || h.maxTemp !== null);
    if (valid.length < 3) return null;
    const temps = valid.flatMap((h) => [h.minTemp, h.maxTemp]).filter((t): t is number => t !== null);
    const lo = Math.min(...temps), hi = Math.max(...temps);
    const span = hi - lo || 1;
    const first = history[0].sol, last = history[history.length - 1].sol;
    const x = (sol: number) => ((sol - first) / (last - first || 1)) * W;
    const y = (t: number) => H - 4 - ((t - lo) / span) * (H - 8);
    const segments = (pick: (h: MarsHistoryPoint) => number | null) => {
      const lines: string[] = [];
      const dots: { cx: number; cy: number }[] = [];
      let run: { cx: number; cy: number }[] = [];
      const flush = () => {
        if (run.length > 1) lines.push(run.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' '));
        else if (run.length === 1) dots.push(run[0]);
        run = [];
      };
      for (const h of history) {
        const t = pick(h);
        if (t === null) flush();
        else run.push({ cx: x(h.sol), cy: y(t) });
      }
      flush();
      return { lines, dots };
    };
    return { highs: segments((h) => h.maxTemp), lows: segments((h) => h.minTemp), lo, hi, first, last };
  });
</script>

{#if chart}
  <div class="history" data-testid="mars-history">
    <svg
      viewBox="0 0 {W} {H}"
      role="img"
      aria-label="Air temperature at Gale Crater, sols {chart.first} to {chart.last}: daily highs and lows between {celsius(chart.lo)} and {celsius(chart.hi)}"
    >
      {#each chart.highs.lines as points (points)}<polyline class="high" {points} />{/each}
      {#each chart.lows.lines as points (points)}<polyline class="low" {points} />{/each}
      {#each chart.highs.dots as d (d.cx)}<circle class="high" cx={d.cx} cy={d.cy} r="2" />{/each}
      {#each chart.lows.dots as d (d.cx)}<circle class="low" cx={d.cx} cy={d.cy} r="2" />{/each}
    </svg>
    <p class="caption">
      Sols {chart.first}–{chart.last}: daily <span class="key high">highs</span> and <span class="key low">lows</span>,
      {celsius(chart.lo)} to {celsius(chart.hi)}
    </p>
  </div>
{/if}

<style>
  .history {
    display: grid;
    gap: 4px;
  }

  svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  polyline {
    fill: none;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  polyline.high {
    stroke: var(--mars);
  }

  polyline.low {
    stroke: var(--ink-dim);
  }

  circle.high {
    fill: var(--mars);
  }

  circle.low {
    fill: var(--ink-dim);
  }

  .caption {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--ink-dim);
  }

  .key.high {
    color: var(--mars);
  }

  .key.low {
    color: var(--ink);
  }
</style>
