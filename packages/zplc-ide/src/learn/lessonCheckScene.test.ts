import { describe, expect } from 'bun:test';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { itNative } from '../cli/nativeRuntimeGuard';
import { lessonCheck } from './lessonCheck';
import { LESSONS_DIRECTORY } from './lessonPackageFiles';

// GDE-004, LRN-026: the Check the Guide calls grades a scene lesson on a plant fact (the path of tools/ci/scene-lessons.ts).
const LESSON = 'plant-belt-to-sensor';
const PROJECTS = join(LESSONS_DIRECTORY, '..', 'projects');

async function grade(project: string) {
  const root = mkdtempSync(join(tmpdir(), 'zplc-g2-scene-'));
  try {
    cpSync(join(PROJECTS, project), root, { recursive: true });
    return await lessonCheck(root, LESSON);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('a scene lesson is graded by the lesson check (GDE-004)', () => {
  itNative(
    'GDE-004 a scene lesson is graded on a plant fact: the solution passes, the starter fails on the fact',
    async () => {
      const solution = await grade('plant_belt_to_sensor');
      expect(solution.ok && solution.record.result).toBe('passed');
      const starter = await grade('plant_belt_to_sensor_starter');
      expect(starter.ok).toBe(true);
      if (!starter.ok) return;
      expect(starter.record.result).toBe('failed');
      expect(starter.record.failedAssertions.some((failure) => Object.keys(failure.expected).some((key) => key.startsWith('fact:')))).toBe(
        true,
      );
    },
    120_000,
  );
});
