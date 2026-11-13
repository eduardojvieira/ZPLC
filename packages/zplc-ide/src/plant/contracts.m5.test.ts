import { describe, expect, it } from 'bun:test';

import type { BodyPose, BodyTag } from './contracts';
import { SCENE_SCHEMA_VERSION } from './core/sceneSchema';

const base = { id: 'a', part: 'box', kind: 'item', size: [0.2, 0.1, 0.2], p: [0, 0, 0], q: [0, 0, 0, 1] } as const;

describe('PRT-001 M5 contract extensions', () => {
  it('PRT-001 a body pose may carry the crate tag', () => {
    const tags = ['crate'] as const satisfies readonly BodyTag[];
    const pose = { ...base, tag: 'crate' } satisfies BodyPose;
    expect(pose.tag).toBe(tags[0]);
  });

  it('PRT-001 box, lid and base tags and a pose with no tag still type-check', () => {
    const tags = ['box', 'lid', 'base'] as const satisfies readonly BodyTag[];
    const poses: BodyPose[] = [...tags.map((tag) => ({ ...base, tag }) satisfies BodyPose), { ...base } satisfies BodyPose];
    expect(poses.map((p) => p.tag)).toEqual(['box', 'lid', 'base', undefined]);
  });

  it('PRT-010 the scene schema version is still 1', () => {
    expect(SCENE_SCHEMA_VERSION).toBe(1);
  });
});
