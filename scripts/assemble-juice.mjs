// Builds static/models/juice.glb from the ESA SPICE Service Cosmographia parts of JUICE
// (https://spiftp.esac.esa.int/data/SPICE/JUICE/misc/models/), placed with ESA's SPICE kernels:
// each part's frame and offset in JUICE_SPACECRAFT, from juice_v*.tf, juice_struct_v*.bsp and the
// juice_sa_zero / juice_mga_zero CKs (read with SpiceyPy on 2026-10-15), and the mesh rotations,
// offsets and scales from the cosmo/config files. Vertices are converted from km to metres. The
// magnetometer boom and radio antennas are left out: no deployed pose is published for them.
//
// Run in a folder holding the .obj and .png parts, with @gltf-transform/core installed:
//   node assemble-juice.mjs juice.glb
// then: npx @gltf-transform/cli optimize juice.glb static/models/juice.glb --compress draco
//   --texture-compress webp --texture-size 1024 --simplify-ratio 0.5 --simplify-error 0.0005
import { Document, NodeIO } from '@gltf-transform/core';
import { readFileSync } from 'fs';

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('JUICE');
const root = doc.createNode('JUICE_SPACECRAFT');
scene.addChild(root);

function parseObj(text) {
  const v = [], vt = [], vn = [];
  const pos = [], uv = [], nor = [], idx = [];
  const map = new Map();
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const p = l.split(/\s+/);
    if (p[0] === 'v') v.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'vt') vt.push(p.slice(1, 3).map(Number));
    else if (p[0] === 'vn') vn.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'f') {
      const corners = p.slice(1).map((c) => {
        if (!map.has(c)) {
          const [a, b, n] = c.split('/').map((s) => (s ? parseInt(s, 10) : 0));
          const vi = a < 0 ? v.length + a : a - 1;
          pos.push(...v[vi].map((x) => x * 1000)); // km to m
          const t = b ? vt[b < 0 ? vt.length + b : b - 1] : [0, 0];
          uv.push(t[0], 1 - t[1]);
          const nn = n ? vn[n < 0 ? vn.length + n : n - 1] : [0, 0, 1];
          nor.push(...nn);
          map.set(c, pos.length / 3 - 1);
        }
        return map.get(c);
      });
      for (let i = 1; i + 1 < corners.length; i++) idx.push(corners[0], corners[i], corners[i + 1]);
    }
  }
  return { pos, uv, nor, idx };
}

const qMul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
function matToQuat(m) { // rows of a rotation matrix (child to parent)
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const t = a + e + i;
  let x, y, z, w;
  if (t > 0) { const s = Math.sqrt(t + 1) * 2; w = s / 4; x = (h - f) / s; y = (c - g) / s; z = (d - b) / s; }
  else if (a > e && a > i) { const s = Math.sqrt(1 + a - e - i) * 2; w = (h - f) / s; x = s / 4; y = (b + d) / s; z = (c + g) / s; }
  else if (e > i) { const s = Math.sqrt(1 + e - a - i) * 2; w = (c - g) / s; x = (b + d) / s; y = s / 4; z = (f + h) / s; }
  else { const s = Math.sqrt(1 + i - a - e) * 2; w = (d - b) / s; x = (c + g) / s; y = (f + h) / s; z = s / 4; }
  const n = Math.hypot(x, y, z, w); return [x / n, y / n, z / n, w / n];
}

function addPart(name, objFile, pngFile, { rot = [[1,0,0],[0,1,0],[0,0,1]], pos = [0,0,0], meshRot = [0,0,0,1], offset = [0,0,0], scale = 1 } = {}) {
  const g = parseObj(readFileSync(objFile, 'utf8'));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buffer));
  const tex = doc.createTexture(name).setImage(readFileSync(pngFile)).setMimeType('image/png');
  prim.setMaterial(doc.createMaterial(name).setBaseColorTexture(tex).setMetallicFactor(0.2).setRoughnessFactor(0.6).setDoubleSided(true));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  // Part frame in the spacecraft frame (SPICE), then the mesh's own rotation, offset and scale in it.
  const frame = doc.createNode(name).setTranslation(pos).setRotation(matToQuat(rot));
  const inner = doc.createNode(name + '_mesh').setMesh(mesh).setRotation(meshRot).setTranslation(offset).setScale([scale, scale, scale]);
  frame.addChild(inner);
  root.addChild(frame);
  console.log(name, g.pos.length / 3, 'vertices', g.idx.length / 3, 'triangles');
}

const s = Math.SQRT1_2;
const SA_MESH = [0, s, 0, s]; // Cosmographia meshRotation for the arrays: 90 degrees about y
addPart('bus', 'juice_sc_bus_v07.obj', 'juice_sc_bus_v07.png');
addPart('sa+y', 'juice_sc_sapy_v02.obj', 'juice_sc_sapy_v02.png', { rot: [[-1,0,0],[0,1,0],[0,0,-1]], pos: [0.0194, 1.0001, 1.6519], meshRot: SA_MESH });
addPart('sa-y', 'juice_sc_sapy_v02.obj', 'juice_sc_sapy_v02.png', { rot: [[1,0,0],[0,-1,0],[0,0,-1]], pos: [0.0194, -1.0001, 1.6519], meshRot: SA_MESH });
const APM = [-1.398, -0.8933, 3.4416];
addPart('mga_dish', 'juice_sc_mga_dish_v04.obj', 'juice_sc_mga_dish_v04.png', { rot: [[0.0018,0.0004,-1],[0.0029,-1,-0.0004],[-1,-0.0029,-0.0018]], pos: APM, offset: [0, 0.025, 0], scale: 1.1 });
addPart('mga_apm', 'juice_sc_mga_apm_v04.obj', 'juice_sc_mga_apm_v04.png', { rot: [[-1,0,-0.0018],[0,-1,-0.0005],[-0.0018,-0.0005,1]], pos: APM, offset: [0, 0, -0.2] });
await new NodeIO().write(process.argv[2] ?? 'juice.glb', doc);
