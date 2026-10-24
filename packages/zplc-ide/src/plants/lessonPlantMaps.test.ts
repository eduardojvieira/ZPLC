import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject, type DebugMap } from '../compiler';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { listIoMap } from '../runtime/ioMap';
import { getLanguageFromFilename } from '../types';
import { resolvePlantMap, validatePlantMap } from './plantMap';

const PROJECTS = join(import.meta.dir, '../../projects');

describe('every lesson that names a plant ships its mapping (LRN-021)', () => {
  const withPlant = LESSON_INDEX.lessons.filter((lesson) => lesson.plant !== null);

  it('covers the four plants', () => {
    expect([...new Set(withPlant.map((lesson) => lesson.plant))].sort()).toEqual(['conveyor-v1', 'motor-v1', 'pedestrian-v1', 'tank-v1']);
  });

  for (const lesson of withPlant) {
    it(`${lesson.id}: the mapping is valid, matches the plant and binds to every I/O point of the real starter`, () => {
      const map = (lesson as { plantMap?: unknown }).plantMap;
      expect(validatePlantMap(map)).toEqual([]);
      expect((map as { plant: string }).plant).toBe(lesson.plant as string);
      // the starter in whichever of the five languages it is written, compiled as its own project names it
      const folder = join(PROJECTS, lesson.starter.project);
      const source = readFileSync(join(folder, lesson.starter.program), 'utf8');
      const project = JSON.parse(readFileSync(join(folder, 'zplc.json'), 'utf8'));
      const program = project.tasks[0].programs[0] as string;
      const debugMap = compileMultiTaskProject(project, [
        { name: program, content: source, language: getLanguageFromFilename(lesson.starter.program), sourceRef: lesson.starter.program },
      ]).debugMap as unknown as DebugMap;
      expect(resolvePlantMap(map as never, listIoMap(debugMap)).problems).toEqual([]);
    });
  }
});
