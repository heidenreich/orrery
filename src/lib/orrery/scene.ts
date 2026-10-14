import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS, SUN, planetPositions, type BodyId, type Planet, type PlanetId, type PositionsAU } from './bodies';
import { orbitPath, type Vec3 } from './orbits';
import { poleQuaternion, toScene } from './axes';
import { craftState, trackEnd, type CraftTrack, type SpacecraftData } from '../data/spacecraft-data';
import { isCraftId, type CraftId, type WorldId } from './craft';
import { SPIN_TILT } from './seasons';
import { REAL_TIME, SIM_MAX_MS, SIM_MIN_MS } from './time';
import { glowTexture, planetTexture, ringTexture, seededRandom } from './textures';

const DAY_MS = 86_400_000;
const SUN_SIZE = 2.6;
const LABEL_HEIGHT = 26;
const ORBIT_COLOR = 0x6b7799;
const ORBIT_SELECTED = 0xf0b65a;
/** How often to re-read the page areas labels must avoid (header, panel, toolbar). */
const AVOID_REFRESH_MS = 300;
const DEG = Math.PI / 180;
/** Matches the CSS: at this width and below, the info panel becomes a bottom sheet. */
const PHONE_MAX_WIDTH = 640;
const PHONE_BODY_SCALE = 1.7;
const NEPTUNE_APHELION_AU = 30.4;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// When labels overlap, the earlier body in this list keeps its label.
const LABEL_PRIORITY: BodyId[] = ['sun', 'earth', 'jupiter', 'saturn', 'mars', 'venus', 'mercury', 'uranus', 'neptune'];

export type ScaleMode = 'compressed' | 'true';

export interface SceneOptions {
  container: HTMLElement;
  labels: Partial<Record<WorldId, HTMLElement>>;
  onSelect: (id: WorldId) => void;
  /** Called a few times per second with the simulated time and real positions. */
  onTick: (simMs: number, positions: PositionsAU) => void;
  /** Playback reached SIM_MIN_MS or SIM_MAX_MS and stopped there. */
  onLimit?: () => void;
  /** The browser dropped the WebGL context (false) or gave it back (true). */
  onContext?: (available: boolean) => void;
  /** Image maps to use in place of the drawn textures, by body, plus Saturn's rings. */
  textures?: TextureUrls;
}

export interface TextureUrls {
  bodies: Partial<Record<BodyId, string>>;
  /** A top-down picture of the rings laid out as RING_IMAGE describes. */
  ring?: string;
}

// Measured on saturn-ring.webp (512 px square): the disc's centre and outer radius in pixels,
// and its inner edge as a fraction of the outer one.
const RING_IMAGE = { size: 512, cx: 254.5, cy: 257, outer: 253.5, innerRatio: 0.499 };
// Saturn's rings in the image (C ring to F ring) run out to about 2.27 planet radii.
const RING_OUTER = 2.27;

/** Frame spacing when the only motion is slow planet spin in real time (about 30 fps). */
const SPIN_ONLY_FRAME_MS = 33;
/** While playing with nothing visibly moving, redraw this often so real-time positions stay current. */
const IDLE_FRAME_MS = 1000;

interface CraftNode {
  track: CraftTrack;
  marker: THREE.Sprite;
  /** The path flown so far, drawn up to the clock's time. */
  trail: THREE.Line;
  /** Where it is at the clock's time, AU; null outside its trajectory. */
  posAU: Vec3 | null;
}

const CRAFT_COLOR = 0x8fe3ff;
/** Trail points drawn per trajectory step, along the same curve the marker follows. */
const TRAIL_SUBSTEPS = 4;
const CRAFT_TRAIL = 0x4f8fa8;

interface PlanetNode {
  planet: Planet;
  size: number;
  holder: THREE.Group;
  mesh: THREE.Mesh;
  ring?: THREE.Mesh;
  line: THREE.Line;
}

const sizeOf = (km: number) => 0.5 * Math.pow(km / 6371, 0.4) + 0.15;
const fCompressed = (r: number) => 18 * Math.sqrt(r);
const fTrue = (r: number) => 12 * r;

export class OrreryScene {
  simMs = Date.now();
  playing = true;
  daysPerSec = REAL_TIME;

  private opts: SceneOptions;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
  // Assigned in setUp(), called from the constructor.
  private controls!: OrbitControls;
  private sunMesh!: THREE.Mesh;
  private nodes: PlanetNode[] = [];
  private beltAU: THREE.Vector3[] = [];
  private beltGeo = new THREE.BufferGeometry();
  private positions!: PositionsAU;

  private scaleMix = 0;
  private scaleGoal = 0;
  private selected: WorldId | null = null;
  private craft: CraftNode[] = [];
  private craftTexture: THREE.Texture | null = null;
  private desiredDist: number | null = null;

  private raf = 0;
  private last = performance.now();
  private lastTick = 0;
  private lastOrbitMs: number | null = null;
  private lastMix = -1;
  private sunGroup = new THREE.Group();
  /** Bodies are drawn this much larger on phones, where the same view covers far fewer pixels. */
  private bodyScale = 1;
  /** Fraction of the canvas width and height the info panel leaves uncovered (see resize()). */
  private free = { x: 1, y: 1 };
  private resizeObserver!: ResizeObserver;
  private downAt: [number, number] | null = null;
  private labelWidths = new Map<WorldId, number>();
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reduceMotion = this.motionQuery.matches;
  // Rendering on demand: see frame().
  private needsRender = true;
  private controlsMoving = true;
  private lastRender = 0;
  private contextLost = false;
  private destroyed = false;

  /** Throws if WebGL is unavailable. */
  constructor(opts: SceneOptions) {
    this.opts = opts;
    const rand = seededRandom(7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    try {
      this.setUp(opts, rand);
    } catch (err) {
      // Don't leave a half-built canvas behind if anything after the renderer fails.
      this.renderer.dispose();
      this.renderer.domElement.remove();
      throw err;
    }
    this.positions = planetPositions(this.simMs);
    if (opts.textures) this.loadTextures(opts.textures);
    this.raf = requestAnimationFrame(this.frame);
  }

  private setUp(opts: SceneOptions, rand: () => number) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x070a14, 1);
    opts.container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 62, 104);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 1800;
    this.controls.addEventListener('change', this.invalidate);

    this.scene.add(new THREE.AmbientLight(0x3a4466, 1.7));
    this.scene.add(new THREE.PointLight(0xfff1dc, 5, 0, 0));

    // Sun and glow
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_SIZE, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcf7a })
    );
    this.sunMesh.userData.id = 'sun';
    this.sunGroup.add(this.sunMesh);
    this.scene.add(this.sunGroup);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      })
    );
    glow.scale.set(SUN_SIZE * 7, SUN_SIZE * 7, 1);
    this.sunGroup.add(glow);

    this.addStars(rand);
    this.addBelt(rand);
    for (const p of PLANETS) this.addPlanet(p, rand);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(opts.container);
    // The info panel changes size as it opens, closes and fills; keep the view in the space it leaves.
    for (const el of document.querySelectorAll('[data-view-avoid]')) this.resizeObserver.observe(el);
    this.resize();
  }

  /** Ask for a redraw on the next frame. */
  private invalidate = () => {
    this.needsRender = true;
  };

  // three.js rebuilds its GPU state when the context comes back; until then, don't draw.
  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.opts.onContext?.(false);
  };

  private onContextRestored = () => {
    this.contextLost = false;
    this.needsRender = true;
    this.opts.onContext?.(true);
  };

  // The drawn textures show at once; each image replaces its planet's when it arrives, and a
  // missing or broken file just leaves the drawn one in place.
  private loadTextures(urls: TextureUrls) {
    const loader = new THREE.TextureLoader();
    const anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const load = (url: string, apply: (t: THREE.Texture) => void) => {
      loader.load(
        url,
        (t) => {
          if (this.destroyed) return t.dispose();
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = anisotropy;
          apply(t);
          this.needsRender = true;
        },
        undefined,
        () => console.warn(`Texture ${url} didn't load; keeping the drawn one.`)
      );
    };
    const swap = (mesh: THREE.Mesh, t: THREE.Texture) => {
      const m = mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.map = t;
      m.color.set(0xffffff);
      m.needsUpdate = true;
    };
    for (const [id, url] of Object.entries(urls.bodies) as [BodyId, string][]) {
      load(url, (t) => swap(id === 'sun' ? this.sunMesh : this.node(id).mesh, t));
    }
    const saturn = this.nodes.find((n) => n.ring);
    if (urls.ring && saturn?.ring) {
      const ring = saturn.ring;
      load(urls.ring, (t) => {
        ring.geometry.dispose();
        ring.geometry = imageRingGeometry(saturn.size);
        swap(ring, t);
      });
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.motionQuery.removeEventListener('change', this.onMotionChange);
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setScale(mode: ScaleMode) {
    this.needsRender = true;
    this.scaleGoal = mode === 'true' ? 1 : 0;
    if (!this.selected) this.desiredDist = this.overviewDistance();
  }

  select(id: WorldId | null) {
    this.needsRender = true;
    this.selected = id;
    this.highlightTrails();
    // Highlight only the selected planet's orbit.
    for (const n of this.nodes) {
      const m = n.line.material as THREE.LineBasicMaterial;
      const on = n.planet.id === id;
      m.color.setHex(on ? ORBIT_SELECTED : ORBIT_COLOR);
      m.opacity = on ? 0.8 : 0.35;
    }
    if (id === null) this.desiredDist = this.overviewDistance();
    else if (id === 'sun') this.desiredDist = 16 * this.bodyScale;
    else if (isCraftId(id)) this.desiredDist = 14 * this.bodyScale;
    else this.desiredDist = this.closeUpDistance(this.node(id));
  }

  // Point each planet's spin axis along its IAU north pole, the same pole the panel's seasons and
  // "Sun overhead at" come from. The mesh spins about the holder's local y (frame()), so it turns
  // about the tilted axis, and the rings, also children of the holder, stay equatorial.
  private orientPoles() {
    for (const n of this.nodes) {
      n.holder.quaternion.copy(poleQuaternion(n.planet.id as PlanetId, this.simMs));
    }
  }

  /** Show these spacecraft (replacing any shown before). */
  setSpacecraft(data: SpacecraftData) {
    for (const c of this.craft) {
      this.scene.remove(c.marker, c.trail);
      c.marker.material.dispose();
      c.trail.geometry.dispose();
      (c.trail.material as THREE.Material).dispose();
    }
    this.craftTexture ??= markerTexture();
    this.craft = data.craft.map((track) => {
      const marker = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.craftTexture, color: CRAFT_COLOR, sizeAttenuation: false, depthWrite: false, transparent: true })
      );
      // Larger than it looks: the diamond is drawn small in the middle of a mostly clear texture,
      // so the sprite, which is what a click or tap hits, is easier to hit than the diamond.
      marker.scale.set(0.045, 0.045, 1);
      marker.userData.id = track.id;
      marker.visible = false;
      const trail = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(new Float32Array(((track.p.length / 3 - 1) * TRAIL_SUBSTEPS + 1) * 3), 3)
        ),
        new THREE.LineBasicMaterial({ color: CRAFT_TRAIL, transparent: true, opacity: 0.55 })
      );
      this.scene.add(trail, marker);
      return { track, marker, trail, posAU: null };
    });
    this.lastOrbitMs = null; // redraw trails with the orbits on the next frame
    // Only recolour: the file can arrive after the user has zoomed, and select() would reset that.
    this.highlightTrails();
    this.needsRender = true;
  }

  private highlightTrails() {
    for (const c of this.craft) {
      const m = c.trail.material as THREE.LineBasicMaterial;
      const on = c.track.id === this.selected;
      m.color.setHex(on ? ORBIT_SELECTED : CRAFT_TRAIL);
      m.opacity = on ? 0.9 : 0.55;
    }
  }

  /** Where a spacecraft is at the clock's time, AU, or null if outside its trajectory. */
  craftPosition(id: CraftId): Vec3 | null {
    return this.craft.find((c) => c.track.id === id)?.posAU ?? null;
  }

  private placeCraft() {
    for (const c of this.craft) {
      const s = craftState(c.track, this.simMs);
      c.posAU = s?.pos ?? null;
      c.marker.visible = !!s;
      c.trail.visible = !!s;
      if (!s) continue;
      c.marker.position.copy(this.scaled(toScene(s.pos)));
      // Trail: every point up to now (they are evenly spaced from the start).
      const total = c.trail.geometry.attributes.position.count;
      const done = Math.floor(((this.simMs - Date.parse(c.track.start)) / c.track.stepMs) * TRAIL_SUBSTEPS) + 1;
      c.trail.geometry.setDrawRange(0, Math.max(0, Math.min(total, done)));
    }
  }

  // Close enough to fill the view, but far enough that the planet and any rings fit across the free
  // width, which on a phone held upright is narrow.
  private closeUpDistance(n: PlanetNode) {
    const radius = n.size * this.bodyScale * (n.ring ? RING_OUTER : 1);
    const halfWidth = Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect * this.free.x;
    return Math.max((n.size * 9 + 2.5) * this.bodyScale, (radius * 1.5) / halfWidth);
  }

  // Compressed, the overview frames the inner and middle planets. To scale, it backs off until
  // Neptune's whole orbit fits across the free part of the screen.
  private overviewDistance() {
    if (!this.scaleGoal) return 125;
    const halfWidth = Math.tan((this.camera.fov * DEG) / 2) * this.camera.aspect * this.free.x;
    return Math.min(this.controls.maxDistance, (fTrue(NEPTUNE_APHELION_AU) * 1.12) / halfWidth);
  }

  private node(id: BodyId) {
    return this.nodes.find((n) => n.planet.id === id)!;
  }

  private scaled(vAU: THREE.Vector3) {
    const r = vAU.length();
    if (r === 0) return vAU.clone();
    const d = fCompressed(r) + (fTrue(r) - fCompressed(r)) * this.scaleMix;
    return vAU.clone().multiplyScalar(d / r);
  }

  private addStars(rand: () => number) {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1, t = rand() * Math.PI * 2, r = 2500 + rand() * 600;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9d3ee, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.7 }))
    );
  }

  // Asteroid belt (2.1–3.3 AU), stored in AU and rescaled with the view.
  private addBelt(rand: () => number) {
    const n = 1400;
    for (let i = 0; i < n; i++) {
      const r = 2.1 + rand() * 1.2, t = rand() * Math.PI * 2, z = (rand() - 0.5) * 0.25;
      this.beltAU.push(new THREE.Vector3(r * Math.cos(t), z, r * Math.sin(t)));
    }
    this.beltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.scene.add(
      new THREE.Points(this.beltGeo, new THREE.PointsMaterial({ color: 0x8c8577, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.55 }))
    );
  }

  private addPlanet(p: Planet, rand: () => number) {
    const size = sizeOf(p.radiusKm);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 40, 28),
      new THREE.MeshStandardMaterial({ map: planetTexture(p, rand), roughness: 0.9, metalness: 0 })
    );
    mesh.userData.id = p.id;
    const holder = new THREE.Group();
    holder.add(mesh);
    let ring: THREE.Mesh | undefined;
    if (p.rings) {
      const inner = size * 1.25, outer = size * 2.3;
      const rg = new THREE.RingGeometry(inner, outer, 128, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
      }
      ring = new THREE.Mesh(
        rg,
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      holder.add(ring);
    }
    this.scene.add(holder);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(361 * 3), 3)),
      new THREE.LineBasicMaterial({ color: ORBIT_COLOR, transparent: true, opacity: 0.35 })
    );
    this.scene.add(line);
    this.nodes.push({ planet: p, size, holder, mesh, ring, line });
  }

  private updateOrbits() {
    for (const c of this.craft) {
      const a = c.trail.geometry.attributes.position.array as Float32Array;
      const t0 = Date.parse(c.track.start), dt = c.track.stepMs / TRAIL_SUBSTEPS;
      for (let i = 0; i < a.length / 3; i++) {
        const s = craftState(c.track, Math.min(trackEnd(c.track), t0 + i * dt));
        if (s) a.set(this.scaled(toScene(s.pos)).toArray(), i * 3);
      }
      c.trail.geometry.attributes.position.needsUpdate = true;
      c.trail.geometry.computeBoundingSphere();
    }
    for (const n of this.nodes) {
      const a = n.line.geometry.attributes.position.array as Float32Array;
      orbitPath(n.planet, this.simMs).forEach((pt, i) => {
        const s = this.scaled(toScene(pt));
        a.set([s.x, s.y, s.z], i * 3);
      });
      n.line.geometry.attributes.position.needsUpdate = true;
      n.line.geometry.computeBoundingSphere();
    }
    const b = this.beltGeo.attributes.position.array as Float32Array;
    this.beltAU.forEach((v, i) => {
      const s = this.scaled(v);
      b.set([s.x, s.y, s.z], i * 3);
    });
    this.beltGeo.attributes.position.needsUpdate = true;
    // The belt spreads further out in true scale; without new bounds it can be culled when zoomed in.
    this.beltGeo.computeBoundingSphere();
  }

  private resize() {
    this.needsRender = true;
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Centre the view in the space the info panel leaves free: on phones it is a bottom sheet, so
    // the focus point sits higher up; wider, it is a column on the right, so it sits further left.
    const phone = w <= PHONE_MAX_WIDTH;
    const panel = document.querySelector('[data-view-avoid]')?.getBoundingClientRect();
    const box = this.opts.container.getBoundingClientRect();
    const free = !panel?.height
      ? { x: 1, y: 1 }
      : phone
        ? { x: 1, y: clamp((panel.top - box.top) / h, 0.3, 1) }
        : { x: clamp((panel.left - box.left) / w, 0.4, 1), y: 1 };
    const changed = Math.abs(free.x - this.free.x) > 0.01 || Math.abs(free.y - this.free.y) > 0.01;
    this.free = free;
    this.camera.setViewOffset(w, h, ((1 - free.x) * w) / 2, ((1 - free.y) * h) / 2, w, h);
    this.camera.updateProjectionMatrix();

    const scale = phone ? PHONE_BODY_SCALE : 1;
    if (scale !== this.bodyScale) {
      this.bodyScale = scale;
      for (const n of this.nodes) n.holder.scale.setScalar(scale);
      this.sunGroup.scale.setScalar(scale);
    }
    // Re-frame the overview when the free space changes (the phone sheet opening or closing).
    if (changed && !this.selected) this.desiredDist = this.overviewDistance();
  }

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reduceMotion = e.matches;
    this.needsRender = true;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = [e.clientX, e.clientY];
  };

  // A click (not a drag) on a planet or the Sun selects it.
  private onPointerUp = (e: PointerEvent) => {
    if (!this.downAt || Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 5) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const markers = this.craft.filter((c) => c.marker.visible).map((c) => c.marker);
    const hit = ray.intersectObjects([...markers, this.sunMesh, ...this.nodes.map((n) => n.mesh)], false)[0];
    if (hit) this.opts.onSelect(hit.object.userData.id as WorldId);
  };

  // Draws only when something on screen can change: while paused with the camera still, nothing is
  // drawn; in real time, where the only motion is slow planet spin, about 30 times a second.
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) {
      // Real time follows the system clock exactly, so it stays correct after the tab was in the background.
      if (this.daysPerSec === REAL_TIME) this.simMs = Date.now();
      else this.simMs += this.daysPerSec * DAY_MS * dt;
      if (this.simMs > SIM_MAX_MS || this.simMs < SIM_MIN_MS) {
        this.simMs = Math.min(SIM_MAX_MS, Math.max(SIM_MIN_MS, this.simMs));
        this.playing = false;
        this.opts.onLimit?.();
      }
    }

    const fast = this.playing && this.daysPerSec !== REAL_TIME;
    const spinning = this.playing && !this.reduceMotion;
    const busy = fast || this.needsRender || this.controlsMoving || this.scaleMix !== this.scaleGoal || this.desiredDist !== null;
    const since = now - this.lastRender;
    const due = busy || (spinning ? since >= SPIN_ONLY_FRAME_MS : this.playing && since >= IDLE_FRAME_MS);
    if (this.contextLost || !due) {
      if (now - this.lastTick > 250) {
        this.lastTick = now;
        this.opts.onTick(this.simMs, this.positions);
      }
      return;
    }
    const step = Math.min(0.1, since / 1000);

    if (this.scaleMix !== this.scaleGoal) {
      this.scaleMix += (this.scaleGoal - this.scaleMix) * this.ease(step * 4);
      if (Math.abs(this.scaleGoal - this.scaleMix) < 0.002) this.scaleMix = this.scaleGoal;
    }

    this.positions = planetPositions(this.simMs);
    this.placeCraft();
    const spin = spinning ? step : 0;
    for (const n of this.nodes) {
      n.holder.position.copy(this.scaled(toScene(this.positions[n.planet.id as PlanetId])));
      // Venus and Uranus turn backwards about their IAU north pole.
      n.mesh.rotation.y += spin * (SPIN_TILT[n.planet.id as PlanetId] ? -0.6 : 0.6);
    }
    this.sunMesh.rotation.y += spin * 0.05;

    // Orbits and poles drift slowly; redraw on scale changes or after a decade of simulated time.
    if (this.lastMix !== this.scaleMix || this.lastOrbitMs === null || Math.abs(this.simMs - this.lastOrbitMs) > 3650 * DAY_MS) {
      this.updateOrbits();
      this.orientPoles();
      this.lastMix = this.scaleMix;
      this.lastOrbitMs = this.simMs;
    }

    this.followSelection(step);
    // update() reports whether the camera moved (including damping after a drag ends).
    this.controlsMoving = this.controls.update();
    this.placeLabels();

    if (now - this.lastTick > 250) {
      this.lastTick = now;
      this.opts.onTick(this.simMs, this.positions);
    }
    this.renderer.render(this.scene, this.camera);
    this.lastRender = now;
    this.needsRender = false;
  };

  /** Fraction of the remaining distance to cover this frame; 1 (jump) when motion is reduced. */
  private ease(rate: number) {
    return this.reduceMotion ? 1 : Math.min(1, rate);
  }

  private focusPoint(): THREE.Vector3 {
    const id = this.selected;
    if (!id || id === 'sun') return new THREE.Vector3();
    if (isCraftId(id)) {
      const c = this.craft.find((n) => n.track.id === id);
      // Outside its trajectory there is nothing to follow; stay where the view is.
      return c?.marker.visible ? c.marker.position : this.controls.target.clone();
    }
    return this.node(id).holder.position;
  }

  private followSelection(dt: number) {
    const goal = this.focusPoint();
    // Ease the gap between the view centre and the goal, measured relative to the moving goal,
    // so a planet in motion stays centred instead of trailing.
    const before = this.controls.target.clone();
    const gap = before.clone().sub(goal).multiplyScalar(1 - this.ease(dt * (this.selected ? 8 : 5)));
    this.controls.target.copy(goal).add(gap);
    this.camera.position.add(this.controls.target.clone().sub(before));
    if (this.desiredDist !== null) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const len = off.length();
      const next = len + (this.desiredDist - len) * this.ease(dt * 3.5);
      this.camera.position.copy(this.controls.target).add(off.setLength(next));
      if (Math.abs(this.desiredDist - next) < 0.05) this.desiredDist = null;
    }
  }

  private labelWidth(id: WorldId, el: HTMLElement) {
    let width = this.labelWidths.get(id);
    if (!width) {
      el.hidden = false;
      width = el.offsetWidth;
      // Cache only a real measurement; fonts or layout may not be ready on the first frame.
      if (width > 0) this.labelWidths.set(id, width);
    }
    return width;
  }

  private avoid: DOMRect[] = [];
  private avoidReadAt = 0;

  /** Page areas labels must not cover: elements marked data-label-avoid (header, panel, toolbar). */
  private avoidRects() {
    const t = performance.now();
    if (t - this.avoidReadAt > AVOID_REFRESH_MS) {
      this.avoidReadAt = t;
      this.avoid = [...document.querySelectorAll('[data-label-avoid]')].map((el) => el.getBoundingClientRect());
    }
    return this.avoid;
  }

  // Place labels in priority order (selection first). Hide any that would overlap a label already
  // placed or sit under the header, panel or toolbar.
  private placeLabels() {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    const avoid = this.avoidRects();
    // Spacecraft labels come after every body's.
    const all: WorldId[] = [...LABEL_PRIORITY, ...this.craft.map((c) => c.track.id)];
    const order = this.selected ? [this.selected, ...all.filter((id) => id !== this.selected)] : all;
    const placed: { x: number; y: number; w: number }[] = [];
    for (const id of order) {
      const el = this.opts.labels[id];
      if (!el) continue;
      let p: THREE.Vector3;
      let lift = 0;
      if (isCraftId(id)) {
        const c = this.craft.find((n) => n.track.id === id);
        if (!c || !c.marker.visible) {
          el.hidden = true;
          continue;
        }
        // Markers are a fixed size on screen, so lift their labels by pixels rather than distance.
        p = c.marker.position.clone();
        lift = 8;
      } else {
        const isSun = id === SUN.id;
        p = (isSun ? this.sunMesh.position : this.node(id).holder.position).clone();
        p.y += (isSun ? SUN_SIZE : this.node(id).size) * this.bodyScale * 1.15;
      }
      p.project(this.camera);
      const width = this.labelWidth(id, el);
      // Keep the whole label on screen, even when its planet sits at the edge.
      const x = Math.min(Math.max(((p.x + 1) / 2) * w, width / 2), w - width / 2);
      const y = ((1 - p.y) / 2) * h - lift;
      const onScreen = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      const overlaps = placed.some((o) => Math.abs(o.x - x) < (o.w + width) / 2 && Math.abs(o.y - y) < LABEL_HEIGHT);
      // The label's box: centred on x, with its bottom edge at y.
      const covered = avoid.some((r) => x + width / 2 > r.left && x - width / 2 < r.right && y > r.top && y - LABEL_HEIGHT < r.bottom);
      el.hidden = !onScreen || overlaps || covered;
      if (el.hidden) continue;
      placed.push({ x, y, w: width });
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }
}

/** A flat ring textured straight from a top-down picture of the rings (RING_IMAGE). */
function imageRingGeometry(planetSize: number) {
  const outer = planetSize * RING_OUTER;
  const g = new THREE.RingGeometry(outer * RING_IMAGE.innerRatio, outer, 128, 3);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const k = RING_IMAGE.outer / outer;
  for (let i = 0; i < pos.count; i++) {
    // Image rows run downward; three.js flips images so v runs upward.
    uv.setXY(i, (RING_IMAGE.cx + pos.getX(i) * k) / RING_IMAGE.size, 1 - (RING_IMAGE.cy - pos.getY(i) * k) / RING_IMAGE.size);
  }
  return g;
}

/** A small glowing diamond for spacecraft markers. */
function markerTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const mid = size / 2;
  // Drawn at half the texture's size (see the marker's scale in setSpacecraft).
  const halo = g.createRadialGradient(mid, mid, 0, mid, mid, mid / 2);
  halo.addColorStop(0, 'rgba(255,255,255,0.55)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(mid, mid - 14);
  g.lineTo(mid + 10, mid);
  g.lineTo(mid, mid + 14);
  g.lineTo(mid - 10, mid);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
