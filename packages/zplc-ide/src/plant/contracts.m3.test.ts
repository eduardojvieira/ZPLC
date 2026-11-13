import { describe, expect, it } from 'bun:test';

import type { BodyPose, PartDefinition } from './contracts';

const FAMILIES = [
  'items',
  'sources',
  'conveyors',
  'flow',
  'sensors',
  'panel',
  'process',
  'manipulators',
  'stations',
] as const satisfies readonly PartDefinition['family'][];

describe('PRT-002 M3 contract extensions', () => {
  it('PRT-002 a part definition may declare the manipulators and stations families', () => {
    expect(FAMILIES).toHaveLength(9);
    expect(new Set(FAMILIES).size).toBe(9);
    expect(FAMILIES).toContain('manipulators');
    expect(FAMILIES).toContain('stations');
    // the seven families of M1 and M2 still hold
    for (const f of ['items', 'sources', 'conveyors', 'flow', 'sensors', 'panel', 'process'] as const) expect(FAMILIES).toContain(f);
  });

  it('PRT-009 a body pose may carry a tag of box, lid or base and a pallet carries none', () => {
    const base = { id: 'a', part: 'box', size: [1, 1, 1], p: [0, 0, 0], q: [0, 0, 0, 1] } as const;
    const tags = ['box', 'lid', 'base'] as const satisfies readonly NonNullable<BodyPose['tag']>[];
    const poses: BodyPose[] = [...tags.map((tag): BodyPose => ({ ...base, kind: 'item', tag })), { ...base, kind: 'pallet' }];
    expect(poses.map((p) => p.tag)).toEqual(['box', 'lid', 'base', undefined]);
    expect('tag' in poses[3]!).toBe(false);
  });
});
