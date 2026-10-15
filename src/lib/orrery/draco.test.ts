import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// static/draco/ is a copy of three's decoder; a three upgrade without refreshing it would break
// the spacecraft models at runtime, so check here (npm run sync:draco fixes it).
describe('Draco decoder copy', () => {
  it.each(['draco_decoder.wasm', 'draco_wasm_wrapper.js'])('%s matches the installed three', (file) => {
    const ours = readFileSync(`static/draco/${file}`);
    const theirs = readFileSync(`node_modules/three/examples/jsm/libs/draco/gltf/${file}`);
    expect(ours.equals(theirs), `static/draco/${file} is out of date: run npm run sync:draco`).toBe(true);
  });
});
