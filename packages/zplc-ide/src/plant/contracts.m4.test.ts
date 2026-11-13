import { describe, expect, it } from 'bun:test';

import type { BodyPose, ItemColour, ItemProps } from './contracts';
import { SCENE_SCHEMA_VERSION } from './core/sceneSchema';

const base = { id: 'a', part: 'box', size: [0.2, 0.1, 0.2], p: [0, 0, 0], q: [0, 0, 0, 1] } as const;

describe('PRT-001 M4 contract extensions', () => {
  it('PRT-001 a body pose may carry a colour, a metal flag and a code', () => {
    const colours = ['red', 'blue'] as const satisfies readonly ItemColour[];
    const props: ItemProps = { colour: 'red', metal: true, code: 3 };
    const poses = [
      ...colours.map((colour) => ({ ...base, kind: 'item', colour }) satisfies BodyPose),
      { ...base, kind: 'item', ...props } satisfies BodyPose,
    ];
    expect(poses.map((p) => p.colour)).toEqual(['red', 'blue', 'red']);
    expect(poses[2]).toMatchObject({ metal: true, code: 3 });
  });

  it('PRT-001 a pallet pose and a tagged pose still type-check without the new fields', () => {
    const poses = [{ ...base, kind: 'pallet' } satisfies BodyPose, { ...base, kind: 'item', tag: 'lid' } satisfies BodyPose];
    for (const p of poses) {
      expect('colour' in p).toBe(false);
      expect('metal' in p).toBe(false);
      expect('code' in p).toBe(false);
    }
  });

  it('PRT-010 the scene schema version is still 1', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });
});
