import { describe, expect, test } from 'bun:test';

import { compileTest } from '../src/runner';
import type { HILTestCase } from '../src/runner';

const NEEDS_TRACE = new Set(['pattern', 'timing', 'error', 'value', 'no_error']);

/**
 * The tests of a table of HIL cases that need no board: every case is a program the repository compiler accepts,
 * and a case that reads the HIL trace says so by not running with tracing off. Running a case on a board is
 * `runSuite` through a link that a person opened (HIL-001, HIL-003).
 */
export function describeCases(title: string, cases: HILTestCase[]): void {
  describe(title, () => {
    test('the table holds cases, each named once, with a source and an assertion', () => {
      expect(cases.length).toBeGreaterThan(0);
      expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
      for (const hilCase of cases) {
        expect(hilCase.source.trim().length).toBeGreaterThan(0);
        expect(hilCase.assertions.length).toBeGreaterThan(0);
      }
    });

    for (const hilCase of cases) {
      test(`${hilCase.id} compiles with the repository compiler`, () => {
        expect(compileTest(hilCase).zplc.length).toBeGreaterThan(32);
        if (hilCase.assertions.some((assertion) => NEEDS_TRACE.has(assertion.type))) expect(hilCase.debugMode).not.toBe('off');
      });
    }
  });
}
