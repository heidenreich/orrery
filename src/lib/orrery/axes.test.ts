import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PLANETS, type PlanetId } from './bodies';
import { planetPosition } from './ephemeris';
import { poleQuaternion, toScene } from './axes';
import { sunGeometry } from './seasons';

const at = Date.parse('2026-10-13T12:00Z');

describe('planet spin axes in the scene', () => {
  // The Sun overhead latitude seen in the 3D view must match the one the panel shows.
  it.each(PLANETS.map((p) => p.id as PlanetId))('%s: tilted axis gives the panel’s subsolar latitude', (id) => {
    const holder = new THREE.Object3D();
    holder.quaternion.copy(poleQuaternion(id, at));
    const mesh = new THREE.Object3D();
    holder.add(mesh);
    mesh.rotation.y = 1.234; // any spin phase: spinning about local y must not move the axis
    holder.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    const toSun = toScene(planetPosition(id, at)).negate().normalize();
    const lat = 90 - (axis.angleTo(toSun) * 180) / Math.PI;
    expect(lat).toBeCloseTo(sunGeometry(id, at).subsolarLatitude, 6);
  });

  it('tilts Saturn’s rings 26.7° from its orbit and lays Uranus on its side', () => {
    const tilt = (id: PlanetId) => {
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(poleQuaternion(id, at));
      return (axis.angleTo(new THREE.Vector3(0, 1, 0)) * 180) / Math.PI;
    };
    // Angles from the ecliptic pole, within a couple of degrees of the tilt to the orbit itself.
    expect(Math.abs(tilt('saturn') - 26.7)).toBeLessThan(2.5);
    expect(Math.abs(tilt('uranus') - 82.2)).toBeLessThan(1.5);
    expect(tilt('earth')).toBeCloseTo(23.44, 1);
  });
});
