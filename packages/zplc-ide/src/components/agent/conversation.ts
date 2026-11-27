/**
 * The follow-up turns of one conversation with the Assistant (AI-18): the last three exchanges, so a person can ask for a hint and then
 * follow up without explaining again. Held in the window only, bounded in number and in length, and sent with the next request, where
 * the provider drops them first when the body is too large.
 */
export const HISTORY_TURNS = 3;
/** The main process admits a history text of at most this many UTF-8 bytes (safeAiHistory in electron/security.ts). */
const MAX_BYTES = 2_048;
const encoder = new TextEncoder();

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/** The text cut to at most `MAX_BYTES` of UTF-8, at a whole character, so an accented answer is never refused for its size. */
function fit(text: string): string {
  if (encoder.encode(text).length <= MAX_BYTES) return text;
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    bytes += encoder.encode(character).length;
    if (bytes > MAX_BYTES) break;
    end += character.length;
  }
  return text.slice(0, end);
}

/** The turns after one more exchange: at most `HISTORY_TURNS` exchanges, oldest first; an empty text is not kept (it is refused). */
export function addTurn(turns: readonly Turn[], question: string, answer: string): Turn[] {
  const exchange: Turn[] = [
    { role: 'user', text: fit(question) },
    { role: 'assistant', text: fit(answer) },
  ];
  return [...turns, ...exchange.filter((turn) => turn.text.trim() !== '')].slice(-2 * HISTORY_TURNS);
}

export const historyOf = (turns: readonly Turn[]): Turn[] => turns.map(({ role, text }) => ({ role, text }));
