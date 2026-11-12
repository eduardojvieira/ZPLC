import { describe, expect, it } from 'bun:test';

import { compileSceneBlock, exchangeScan, factTruthy, type ScenarioPlantPort } from './scenePort';

describe('compileSceneBlock', () => {
  const block = { file: 'scene.json', map: 'plant-map.json', script: [{ atMs: 10, operate: { signal: 'S.pressed', value: true } }] };

  it('SCN-005 returns the block for a well-formed input', () => {
    expect(compileSceneBlock(block)).toEqual(block);
  });

  it('SCN-005 collects located problems instead of throwing', () => {
    expect(compileSceneBlock({ ...block, script: [{ atMs: -1, operate: {} }] })).toEqual({ problems: ['scene.script[0].atMs: must be a non-negative integer'] });
    expect(compileSceneBlock({ ...block, extra: 1 })).toEqual({ problems: ['scene: must have exactly the keys file, map, script'] });
    expect(compileSceneBlock(7)).toEqual({ problems: ['scene: must be an object'] });
    expect(compileSceneBlock({ ...block, script: [{ atMs: 0, emit: { kind: 'box', at: [0, 0] } }] })).toEqual({
      problems: ['scene.script[0].emit: needs a kind and an at of three numbers'],
    });
  });
});

describe('factTruthy', () => {
  it('SCN-005 a fact is true-ish when a number is above 0, a boolean is true or a string is not empty', () => {
    expect([factTruthy(1), factTruthy(0), factTruthy(-1), factTruthy(true), factTruthy(false), factTruthy('a'), factTruthy(''), factTruthy(undefined)]).toEqual([
      true, false, false, true, false, true, false, false,
    ]);
  });
});

describe('exchangeScan', () => {
  it('PLT-017 reads the command points of the map, advances the plant once and writes only the mapped sensors', async () => {
    const seen: string[] = [];
    const port = {
      map: {
        schemaVersion: 2,
        target: { scene: 'x' },
        signals: {
          'A.run': { direction: 'command', type: 'BOOL', point: 'P.A' },
          'B.detect': { direction: 'sensor', type: 'BOOL', point: 'P.B' },
        },
      },
      core: {
        apply: (commands: unknown) => seen.push(`apply ${JSON.stringify(commands)}`),
        advance: (ms: number) => seen.push(`advance ${ms}`),
        sense: () => ({ 'B.detect': true, 'Unmapped.x': true }),
        operate: (signal: string, value: unknown) => seen.push(`operate ${signal} ${value}`),
      },
    } as unknown as ScenarioPlantPort;
    let written: unknown;
    await exchangeScan(
      port,
      async (point) => {
        seen.push(`read ${point}`);
        return true;
      },
      async (sensors) => void (written = sensors),
      20,
      10,
      [
        { atMs: 20, operate: { signal: 'S.pressed', value: true } },
        { atMs: 30, operate: { signal: 'late', value: true } },
      ],
    );
    expect(seen).toEqual(['operate S.pressed true', 'read P.A', 'apply {"A.run":true}', 'advance 10']);
    expect(written).toEqual({ 'B.detect': true });
  });
});
