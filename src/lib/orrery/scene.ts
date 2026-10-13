import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLANETS, SUN, planetPositions, type BodyId, type Planet, type PlanetId, type PositionsAU } from './bodies';
import { orbitPath, type Vec3 } from './orbits';
import { REAL_TIME } from './time';
import { glowTexture, planetTexture, ringTexture, seededRandom } from './textures';

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;
const SUN_SIZE = 2.6;
const LABEL_HEIGHT = 26;
const ORBIT_COLOR = 0x6b7799;
const ORBIT_SELECTED = 0xf0b65a;
/** How often to re-read the page areas labels must avoid (header, panel, toolbar). */
const AVOID_REFRESH_MS = 300;

// When labels overlap, the earlier body in this list keeps its label.
const LABEL_PRIORITY: BodyId[] = ['mars', 'earth', 'sun', 'jupiter', 'saturn', 'venus', 'mercury', 'uranus', 'neptune'];

export type ScaleMode = 'compressed' | 'true';

export interface SceneOptions {
  container: HTMLElement;
  labels: Partial<Record<BodyId, HTMLElement>>;
  onSelect: (id: BodyId) => void;
  /** Called a few times per second with the simulated time and real positions. */
  onTick: (simMs: number, positions: PositionsAU) => void;
}

interface PlanetNode {
  planet: Planet;
  size: number;
  holder: THREE.Group;
  mesh: THREE.Mesh;
  line: THREE.Line;
}

// Ecliptic (z = north) to scene axes (y = up).
const toScene = (p: Vec3) => new THREE.Vector3(p.x, p.z, -p.y);
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
  private controls: OrbitControls;
  private sunMesh: THREE.Mesh;
  private nodes: PlanetNode[] = [];
  private beltAU: THREE.Vector3[] = [];
  private beltGeo = new THREE.BufferGeometry();
  private positions!: PositionsAU;

  private scaleMix = 0;
  private scaleGoal = 0;
  private selected: BodyId | null = null;
  private desiredDist: number | null = null;

  private raf = 0;
  private last = performance.now();
  private lastTick = 0;
  private lastOrbitMs: number | null = null;
  private lastMix = -1;
  private resizeObserver: ResizeObserver;
  private downAt: [number, number] | null = null;
  private labelWidths = new Map<BodyId, number>();
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reduceMotion = this.motionQuery.matches;

  /** Throws if WebGL is unavailable. */
  constructor(opts: SceneOptions) {
    this.opts = opts;
    const rand = seededRandom(7);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x070a14, 1);
    opts.container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 62, 104);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 1800;

    this.scene.add(new THREE.AmbientLight(0x3a4466, 1.7));
    this.scene.add(new THREE.PointLight(0xfff1dc, 5, 0, 0));

    // Sun and glow
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(SUN_SIZE, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffcf7a })
    );
    this.sunMesh.userData.id = 'sun';
    this.scene.add(this.sunMesh);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      })
    );
    glow.scale.set(SUN_SIZE * 7, SUN_SIZE * 7, 1);
    this.scene.add(glow);

    this.addStars(rand);
    this.addBelt(rand);
    for (const p of PLANETS) this.addPlanet(p, rand);

    this.positions = planetPositions(this.simMs);

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.motionQuery.addEventListener('change', this.onMotionChange);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(opts.container);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.motionQuery.removeEventListener('change', this.onMotionChange);
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
    this.scaleGoal = mode === 'true' ? 1 : 0;
    if (!this.selected) this.desiredDist = this.overviewDistance();
  }

  select(id: BodyId | null) {
    this.selected = id;
    // Highlight only the selected planet's orbit.
    for (const n of this.nodes) {
      const m = n.line.material as THREE.LineBasicMaterial;
      const on = n.planet.id === id;
      m.color.setHex(on ? ORBIT_SELECTED : ORBIT_COLOR);
      m.opacity = on ? 0.8 : 0.35;
    }
    if (id === null) this.desiredDist = this.overviewDistance();
    else if (id === 'sun') this.desiredDist = 16;
    else this.desiredDist = this.node(id).size * 9 + 2.5;
  }

  private overviewDistance() {
    return this.scaleGoal ? 520 : 125;
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
    if (p.tilt) holder.rotation.z = p.tilt * DEG;
    if (p.rings) {
      const inner = size * 1.25, outer = size * 2.3;
      const rg = new THREE.RingGeometry(inner, outer, 128, 1);
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, (Math.hypot(pos.getX(i), pos.getY(i)) - inner) / (outer - inner), 0.5);
      }
      const ring = new THREE.Mesh(
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
    this.nodes.push({ planet: p, size, holder, mesh, line });
  }

  private updateOrbits() {
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
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.opts.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // On phones the info panel is a bottom sheet, so render the focus point higher up.
    if (w <= 640) this.camera.setViewOffset(w, h, 0, h * 0.25, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reduceMotion = e.matches;
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
    const hit = ray.intersectObjects([this.sunMesh, ...this.nodes.map((n) => n.mesh)], false)[0];
    if (hit) this.opts.onSelect(hit.object.userData.id as BodyId);
  };

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.playing) {
      // Real time follows the system clock exactly, so it stays correct after the tab was in the background.
      if (this.daysPerSec === REAL_TIME) this.simMs = Date.now();
      else this.simMs += this.daysPerSec * DAY_MS * dt;
    }

    if (this.scaleMix !== this.scaleGoal) {
      this.scaleMix += (this.scaleGoal - this.scaleMix) * this.ease(dt * 4);
      if (Math.abs(this.scaleGoal - this.scaleMix) < 0.002) this.scaleMix = this.scaleGoal;
    }

    this.positions = planetPositions(this.simMs);
    const spin = this.reduceMotion ? 0 : dt;
    for (const n of this.nodes) {
      n.holder.position.copy(this.scaled(toScene(this.positions[n.planet.id as PlanetId])));
      n.mesh.rotation.y += spin * 0.6;
    }
    this.sunMesh.rotation.y += spin * 0.05;

    // Orbits drift slowly; redraw on scale changes or after a decade of simulated time.
    if (this.lastMix !== this.scaleMix || this.lastOrbitMs === null || Math.abs(this.simMs - this.lastOrbitMs) > 3650 * DAY_MS) {
      this.updateOrbits();
      this.lastMix = this.scaleMix;
      this.lastOrbitMs = this.simMs;
    }

    this.followSelection(dt);
    this.controls.update();
    this.placeLabels();

    if (now - this.lastTick > 250) {
      this.lastTick = now;
      this.opts.onTick(this.simMs, this.positions);
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Fraction of the remaining distance to cover this frame; 1 (jump) when motion is reduced. */
  private ease(rate: number) {
    return this.reduceMotion ? 1 : Math.min(1, rate);
  }

  private followSelection(dt: number) {
    const goal =
      this.selected && this.selected !== 'sun' ? this.node(this.selected).holder.position : new THREE.Vector3();
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

  private labelWidth(id: BodyId, el: HTMLElement) {
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
    const order = this.selected
      ? [this.selected, ...LABEL_PRIORITY.filter((id) => id !== this.selected)]
      : LABEL_PRIORITY;
    const placed: { x: number; y: number; w: number }[] = [];
    for (const id of order) {
      const el = this.opts.labels[id];
      if (!el) continue;
      const isSun = id === SUN.id;
      const p = (isSun ? this.sunMesh.position : this.node(id).holder.position).clone();
      p.y += (isSun ? SUN_SIZE : this.node(id).size) * 1.15;
      p.project(this.camera);
      const width = this.labelWidth(id, el);
      // Keep the whole label on screen, even when its planet sits at the edge.
      const x = Math.min(Math.max(((p.x + 1) / 2) * w, width / 2), w - width / 2);
      const y = ((1 - p.y) / 2) * h;
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
