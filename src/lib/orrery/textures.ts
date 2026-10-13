import * as THREE from 'three';
import type { Planet } from './bodies';

// Seeded random so procedural textures look the same on every load.
export function seededRandom(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPOTS: Record<string, string[]> = {
  earth: ['#3f8a4f', '#6aa45b', '#e9eef4'],
  mars: ['#a24f2c', '#d98b5f', '#7d3a22'],
  venus: ['#efd7a6', '#d2ae74'],
  mercury: ['#8b847c', '#bdb5ab', '#76706a']
};

export function planetTexture(p: Planet, rand: () => number) {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  return canvasTexture(512, 256, (g, w, h) => {
    if (p.bands) {
      for (let y = 0; y < h; ) {
        const bh = 6 + rand() * 22;
        g.fillStyle = pick(p.bands);
        g.fillRect(0, y, w, bh + 1);
        y += bh;
      }
      g.globalAlpha = 0.18;
      for (let i = 0; i < 260; i++) {
        g.fillStyle = pick(p.bands);
        g.fillRect(rand() * w, rand() * h, 20 + rand() * 80, 1 + rand() * 3);
      }
      g.globalAlpha = 1;
      if (p.id === 'jupiter') {
        g.fillStyle = '#b5543a';
        g.beginPath();
        g.ellipse(w * 0.62, h * 0.64, 26, 13, 0, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    g.fillStyle = p.color;
    g.fillRect(0, 0, w, h);
    const spots = SPOTS[p.id] ?? [p.color];
    for (let i = 0; i < 420; i++) {
      g.globalAlpha = 0.25 + rand() * 0.5;
      g.fillStyle = pick(spots);
      g.beginPath();
      g.ellipse(rand() * w, rand() * h, 4 + rand() * 26, 3 + rand() * 14, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (p.id === 'earth' || p.id === 'mars') {
      g.fillStyle = p.id === 'earth' ? '#f4f7fb' : '#f1e6dc';
      g.fillRect(0, 0, w, h * 0.06);
      g.fillRect(0, h * 0.95, w, h * 0.05);
    }
  });
}

export function ringTexture() {
  return canvasTexture(256, 1, (g, w) => {
    for (let x = 0; x < w; x++) {
      const f = x / w;
      const gap = f > 0.58 && f < 0.64 ? 0.08 : 1; // Cassini Division
      const a = (0.35 + 0.5 * Math.abs(Math.sin(f * 40))) * gap * (f < 0.08 ? f / 0.08 : 1);
      g.fillStyle = `rgba(226, 206, 160, ${a.toFixed(3)})`;
      g.fillRect(x, 0, 1, 1);
    }
  });
}

export function glowTexture() {
  return canvasTexture(256, 256, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,214,140,0.9)');
    grd.addColorStop(0.25, 'rgba(255,170,80,0.35)');
    grd.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}
