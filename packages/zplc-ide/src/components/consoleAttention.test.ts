// IDE-020: the Problems view lists the errors first, and a message written while another view is visible raises an indicator.
import { describe, expect, it } from 'bun:test';
import { orderProblems, seenAfter, unseenCounts } from './consoleAttention';

describe('the order of the problems (IDE-020)', () => {
  it('lists errors, then warnings, then information, and keeps the order inside a kind', () => {
    const messages = [
      { type: 'info', message: 'i1' },
      { type: 'warning', message: 'w1' },
      { type: 'error', message: 'e1' },
      { type: 'warning', message: 'w2' },
      { type: 'error', message: 'e2' },
    ] as const;
    expect(orderProblems(messages).map((m) => m.message)).toEqual(['e1', 'e2', 'w1', 'w2', 'i1']);
  });
  it('does not change the list it is given', () => {
    const messages = [
      { type: 'warning', message: 'w' },
      { type: 'error', message: 'e' },
    ] as const;
    orderProblems(messages);
    expect(messages[0].message).toBe('w');
  });
});

describe('what was written while another view was visible (IDE-020)', () => {
  it('counts what arrived after the last time the view was seen', () => {
    expect(unseenCounts({ output: 7, problems: 2 }, { output: 4, problems: 2 })).toEqual({ output: 3, problems: 0 });
  });
  it('counts nothing for a view that was cleared below what was seen', () => {
    expect(unseenCounts({ output: 1 }, { output: 4 })).toEqual({ output: 0 });
  });
  it('marks the visible view as seen, and clamps a view that was cleared', () => {
    expect(seenAfter({ output: 4, problems: 0 }, { output: 7, problems: 2 }, 'output')).toEqual({ output: 7, problems: 0 });
    expect(seenAfter({ output: 9 }, { output: 1 }, 'problems')).toEqual({ output: 1 });
  });
});
