import { describe, expect, it } from 'bun:test';
import { addTurn, HISTORY_TURNS, historyOf } from './conversation';

// AI-18: the follow-up turns of one conversation are bounded.
describe('the follow-up history of the Assistant (AI-18)', () => {
  it('AI-18 keeps the last three exchanges, oldest first, and no more', () => {
    let turns: ReturnType<typeof addTurn> = [];
    for (let n = 1; n <= 5; n += 1) turns = addTurn(turns, `question ${n}`, `answer ${n}`);
    expect(HISTORY_TURNS).toBe(3);
    expect(turns.map((turn) => turn.text)).toEqual(['question 3', 'answer 3', 'question 4', 'answer 4', 'question 5', 'answer 5']);
    expect(historyOf(turns)).toEqual(turns.map(({ role, text }) => ({ role, text })));
  });

  it('AI-18 bounds the length of a long answer', () => {
    const turns = addTurn([], 'q', 'a'.repeat(5000));
    expect(turns[1]!.text.length).toBeLessThanOrEqual(2000);
  });
});
