import { describe, expect, it } from 'bun:test';
import { forceAnnouncements, type ForceSnapshot } from './forceAnnouncements';

const state = (paths: string[], unconfirmed = false): ForceSnapshot => ({ paths, unconfirmed });

describe('the announcements of the force state (UX-026)', () => {
  it('says which variable was forced and which was released', () => {
    expect(forceAnnouncements(state([]), state(['Main.Start']))).toEqual([{ message: 'Forced Main.Start', politeness: 'polite' }]);
    expect(forceAnnouncements(state(['Main.Start']), state([]))).toEqual([
      { message: 'Force released on Main.Start', politeness: 'polite' },
    ]);
  });

  it('says that all forces were released when several go at once, and nothing when nothing changed', () => {
    expect(forceAnnouncements(state(['A', 'B']), state([]))).toEqual([{ message: 'All forces released', politeness: 'polite' }]);
    expect(forceAnnouncements(state(['A']), state(['A']))).toEqual([]);
  });

  it('raises a force that became unconfirmed as a fault, once', () => {
    expect(forceAnnouncements(state(['A']), state(['A'], true))).toEqual([
      { message: 'A force is unconfirmed: verify and reconnect before operating', politeness: 'assertive' },
    ]);
    expect(forceAnnouncements(state(['A'], true), state(['A'], true))).toEqual([]);
  });
});
