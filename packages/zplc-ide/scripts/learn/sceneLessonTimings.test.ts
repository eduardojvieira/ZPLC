import { describe, expect, it } from 'bun:test';

import { compareTimings, type TimingsFile } from './sceneLessonTimings';

const run = (hash: string, ms: number, grade = 'passed') => ({ grade, traceSha256: hash, ms });
const file = (...lessons: TimingsFile['lessons']): TimingsFile => ({ commit: 'c', uptime: '0', lessons });

describe('compareTimings', () => {
  const a = file({ id: '1.1', starter: run('aa', 10, 'failed'), solution: run('bb', 20) });

  it('is clean for identical results', () => {
    expect(compareTimings(a, structuredClone(a))).toEqual([]);
  });

  it('lists a lesson whose trace hash differs', () => {
    const b = file({ id: '1.1', starter: run('aa', 10, 'failed'), solution: run('cc', 20) });
    expect(compareTimings(a, b)).toEqual(['1.1 solution: traceSha256 bb -> cc']);
  });

  it('lists a lesson whose grade differs, and one that is missing', () => {
    const b = file({ id: '1.1', starter: run('aa', 10, 'passed'), solution: run('bb', 20) });
    expect(compareTimings(a, b)).toEqual(['1.1 starter: grade failed -> passed']);
    expect(compareTimings(a, file())).toEqual(['1.1: missing from the new run']);
  });

  it('never compares times', () => {
    const b = file({ id: '1.1', starter: run('aa', 9999, 'failed'), solution: run('bb', 1) });
    expect(compareTimings(a, b)).toEqual([]);
  });
});
