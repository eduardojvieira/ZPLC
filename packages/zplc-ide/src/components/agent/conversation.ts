/**
 * The follow-up turns of one conversation with the Assistant (AI-18): the last three exchanges, so a person can ask for a hint and then
 * follow up without explaining again. Held in the window only, bounded in number and in length, and sent with the next request, where
 * the provider drops them first when the body is too large.
 */
export const HISTORY_TURNS = 3;
const MAX_TEXT = 2_000;

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/** The turns after one more exchange: at most `HISTORY_TURNS` exchanges, oldest first. */
export function addTurn(turns: readonly Turn[], question: string, answer: string): Turn[] {
  return [
    ...turns,
    { role: 'user' as const, text: question.slice(0, MAX_TEXT) },
    { role: 'assistant' as const, text: answer.slice(0, MAX_TEXT) },
  ].slice(-2 * HISTORY_TURNS);
}

export const historyOf = (turns: readonly Turn[]): Turn[] => turns.map(({ role, text }) => ({ role, text }));
