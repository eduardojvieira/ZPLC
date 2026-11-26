/**
 * The 43-lesson sweep of AIX-015 (AI-03, AI-08): every scene lesson solution answers trace_get in every mode, with no
 * MCP_INTERNAL_ERROR, every answer under 512 KiB, and the traceSha256 its scenario_run had before AIX-U5
 * (`traceSweep.base.json`, recorded at a4831267). It runs each lesson four times, so it is opt-in:
 *
 *   ZPLC_TRACE_SWEEP=1 bun test ./src/mcp/traceSweep.test.ts
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

import { LESSON_INDEX } from '../generated/lessonIndex';
import { createMcpDispatcher, MAX_OUTPUT_BYTES, openMcpWorkspace } from './server';
import base from './traceSweep.base.json';

const PROJECTS = fileURLToPath(new URL('../../projects/', import.meta.url));
const sweep = !['', '0', 'false', undefined].includes(process.env.ZPLC_TRACE_SWEEP);

describe('the 43-lesson trace sweep (AIX-015, AI-03, AI-08)', () => {
  test('AIX-015 the base lists every scene lesson', () => {
    const scene = LESSON_INDEX.lessons.filter((lesson) => lesson.scene !== undefined).map((lesson) => lesson.id);
    expect(base.lessons.map((lesson) => lesson.lesson)).toEqual(scene);
    expect(scene.length).toBe(43);
  });

  test.skipIf(!sweep)(
    'AIX-015 every lesson answers every mode under 512 KiB with its 2.0 traceSha256',
    async () => {
      const problems: string[] = [];
      for (const entry of base.lessons) {
        const lesson = LESSON_INDEX.lessons.find((candidate) => candidate.id === entry.lesson)!;
        const root = mkdtempSync(join(tmpdir(), 'zplc-trace-sweep-'));
        try {
          cpSync(join(PROJECTS, lesson.solution.project), root, { recursive: true });
          const dispatch = createMcpDispatcher((await openMcpWorkspace(root))!);
          const sizes: string[] = [];
          for (const args of [{}, { mode: 'changes' }, { mode: 'window', fromMs: 0, limit: 200 }, { mode: 'summary' }]) {
            const result = await dispatch('trace_get', { scenarioId: entry.scenarioId, ...args }, new AbortController().signal);
            const body = result.structuredContent as { error?: string; traceSha256?: string };
            const bytes = Buffer.byteLength(result.content[0]!.text);
            const mode = 'mode' in args ? args.mode : 'whole';
            sizes.push(`${mode} ${body.error ?? `${Math.round(bytes / 1024)} KiB`}`);
            if (bytes > MAX_OUTPUT_BYTES) problems.push(`${entry.lesson} ${mode}: ${bytes} bytes`);
            // the whole trace of a large run is refused with its next step; any other refusal is a defect
            if (body.error !== undefined && !(mode === 'whole' && body.error === 'MCP_OUTPUT_LIMIT'))
              problems.push(`${entry.lesson} ${mode}: ${body.error}`);
            if (body.error === undefined && body.traceSha256 !== entry.traceSha256)
              problems.push(`${entry.lesson} ${mode}: traceSha256 ${body.traceSha256} != ${entry.traceSha256}`);
          }
          console.log(`${entry.lesson}: ${sizes.join(', ')}`);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
      expect(problems).toEqual([]);
    },
    3_600_000,
  );
});
