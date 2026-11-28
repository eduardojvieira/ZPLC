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
    expect(Buffer.byteLength(turns[1]!.text)).toBe(2048);
  });

  // the main process admits a history text of at most 2048 UTF-8 bytes (safeAiHistory in electron/security.ts)
  it.each([
    ['a Spanish answer', 'Válvula abierta: revise la condición del sensor. '.repeat(60)],
    ['an answer with arrows', 'A → B ≥ C '.repeat(300)],
    ['an answer with emoji', '🙂 '.repeat(1000)],
  ])('AI-18 %s is kept within 2048 UTF-8 bytes, cut at a whole character', (_name, answer) => {
    const text = addTurn([], 'q', answer)[1]!.text;
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048);
    expect(Buffer.byteLength(text)).toBeGreaterThan(2040);
    expect(answer.startsWith(text)).toBe(true);
    expect(text).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it('AI-18 an empty answer is not kept, so the next follow-up is not refused', () => {
    expect(addTurn([], 'q', '   ').map((turn) => turn.role)).toEqual(['user']);
  });

  it('AI-18 a short answer is kept as it is', () => {
    expect(addTurn([], 'q', 'Válvula → abierta')[1]!.text).toBe('Válvula → abierta');
  });
});
