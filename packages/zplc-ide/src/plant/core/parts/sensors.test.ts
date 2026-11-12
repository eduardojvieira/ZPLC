import { afterEach, describe, expect, it } from 'bun:test';
import type { PlantCore, PlantSceneFile, ScenePart } from '../../contracts';
import { createPlantCore } from '../plantCore';

const cores: PlantCore[] = [];
afterEach(() => {
  for (const c of cores.splice(0)) c.dispose();
});

export const part = (
  id: string,
  partId: string,
  position: [number, number, number],
  config: ScenePart['config'] = {},
  rotationYDeg = 0,
): ScenePart => ({
  id,
  part: partId,
  name: id.replace(/-/g, '_'),
  position,
  rotationYDeg,
  config,
});
const sceneOf = (parts: ScenePart[]): PlantSceneFile => ({ schemaVersion: 1, name: 'test', parts, cameras: [] });
const make = async (parts: ScenePart[]) => {
  const core = await createPlantCore(sceneOf(parts));
  cores.push(core);
  return core;
};
const TOP = 0.45;
// A sensor at z = -0.5 aiming along +z (rotation 270 degrees) across a belt whose surface is y = 0.45.
const eye = (partId: string) => part('eye', partId, [0, TOP, -0.5], { rangeM: 1 }, 270);
const run = (core: PlantCore, ms: number) => {
  for (let t = 0; t < ms; t += 5) core.advance(5);
};

describe('optical sensors', () => {
  it('PRT-006 an optical sensor reacts to anything that breaks its beam', async () => {
    const core = await make([part('belt', 'belt', [0, TOP, 0], { length: 4 }), eye('sensor-diffuse')]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(false);
    core.addItem('box', [0, TOP, 0]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(true);
    core.reset();
    core.addItem('pallet', [0, TOP, 0]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(true);
  });

  it('PRT-006 a retro-reflective sensor is blocked by an item and clear without one', async () => {
    const core = await make([part('belt', 'belt', [0, TOP, 0], { length: 4 }), eye('sensor-retro')]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(false);
    const id = core.addItem('box', [0, TOP, 0]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(true);
    core.removeItem(id);
    run(core, 5);
    expect(core.sense()['eye.detect']).toBe(false);
  });

  it('PRT-006 the beam stops at its range', async () => {
    const core = await make([
      part('belt', 'belt', [0, TOP, 0], { length: 4 }),
      part('eye', 'sensor-diffuse', [0, TOP, -0.5], { rangeM: 0.2 }, 270),
    ]);
    core.addItem('box', [0, TOP, 0]); // the box starts 0.35 m from the sensor
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(false);
  });
});

describe('stop blade', () => {
  const lineup = () => [part('belt', 'belt', [0, TOP, 0], { length: 4 }), part('blade', 'stop-blade', [0.5, TOP, 0])];
  const boxX = (core: PlantCore) => core.snapshot().items[0]!.p[0];

  it('PRT-003 the stop blade stops a box on a running belt and releases it on retract', async () => {
    const core = await make(lineup());
    core.addItem('box', [-1.2, TOP, 0]);
    core.apply({ 'belt.run': true, 'blade.extend': true });
    run(core, 4000);
    const held = boxX(core);
    expect(held).toBeGreaterThan(0.2);
    expect(held).toBeLessThan(0.5); // the box did not pass the blade
    run(core, 1000);
    expect(Math.abs(boxX(core) - held)).toBeLessThan(0.01); // and it stays, while the belt keeps running
    core.apply({ 'belt.run': true, 'blade.extend': false });
    run(core, 2500);
    expect(boxX(core)).toBeGreaterThan(0.8);
  });

  it('PRT-003 the limit sensors change at the travel limit, not before', async () => {
    const core = await make(lineup());
    expect(core.sense()).toMatchObject({ 'blade.retracted': true, 'blade.extended': false });
    core.apply({ 'blade.extend': true });
    core.advance(5);
    expect(core.sense()).toMatchObject({ 'blade.retracted': false, 'blade.extended': false });
    run(core, 390); // 395 ms in total
    expect(core.sense()['blade.extended']).toBe(false);
    core.advance(5); // 400 ms
    expect(core.sense()).toMatchObject({ 'blade.retracted': false, 'blade.extended': true });
    core.apply({ 'blade.extend': false });
    run(core, 395);
    expect(core.sense()['blade.extended']).toBe(false);
    expect(core.sense()['blade.retracted']).toBe(false);
    core.advance(5);
    expect(core.sense()['blade.retracted']).toBe(true);
  });

  it('PRT-008 a stuck blade does not move', async () => {
    const core = await make(lineup());
    core.act('blade', 'stuck');
    core.apply({ 'blade.extend': true });
    run(core, 1000);
    expect(core.sense()).toMatchObject({ 'blade.retracted': true, 'blade.extended': false });
  });
});

describe('faults', () => {
  it('PRT-008 a stuck sensor reports its stuck value whatever the plant does', async () => {
    const core = await make([part('belt', 'belt', [0, TOP, 0], { length: 4 }), eye('sensor-diffuse')]);
    core.act('eye', 'stuckOn');
    run(core, 20);
    expect(core.sense()['eye.detect']).toBe(true);
    const id = core.addItem('box', [0, TOP, 0]);
    run(core, 20);
    core.removeItem(id);
    run(core, 20);
    expect(core.sense()['eye.detect']).toBe(true);
    core.act('eye', 'stuckOff');
    core.addItem('box', [0, TOP, 0]);
    run(core, 50);
    expect(core.sense()['eye.detect']).toBe(false);
  });

  it('PLT-011 a fault action is triggered by name', async () => {
    const core = await make([part('belt', 'belt', [0, TOP, 0], { length: 4 }), eye('sensor-diffuse')]);
    expect(() => core.act('nothing', 'stuckOn')).toThrow('unknown part "nothing"; the scene has: belt, eye');
    expect(() => core.act('eye', 'melt')).toThrow('has no action "melt"; it has: stuckOn, stuckOff');
    core.addItem('box', [-1.5, TOP, 0]);
    core.act('belt', 'stall');
    core.apply({ 'belt.run': true });
    run(core, 1000);
    expect(core.snapshot().items[0]!.p[0]).toBeCloseTo(-1.5, 1); // a stalled belt does not move it
  });
});

describe('panel parts', () => {
  it('PRT-001 a push button is operated by a person and an indicator light follows its signal', async () => {
    const core = await make([part('start', 'push-button', [0, 1, 0]), part('lamp', 'indicator-light', [0, 1, 1])]);
    expect(core.sense()['start.pressed']).toBe(false);
    core.operate('start.pressed', true);
    expect(core.sense()['start.pressed']).toBe(true);
    expect(() => core.operate('lamp.lit', true)).toThrow('unknown signal "lamp.lit"');
    core.apply({ 'lamp.lit': true });
    core.advance(5);
    expect(core.snapshot().parts.find((p) => p.name === 'lamp')!.state).toEqual({ lit: true });
    core.operate('start.pressed', false);
    expect(core.sense()['start.pressed']).toBe(false);
  });
});
