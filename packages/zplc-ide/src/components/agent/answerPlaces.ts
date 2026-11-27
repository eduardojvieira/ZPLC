/**
 * The places an answer of the Assistant names (AIX-004): a project file, a file and a line, or an element of a diagram. Finding them is
 * text only; whether a place exists in the open project is checked by `checkProposals` before it is offered as a button.
 */
import type { AiProposal } from '../../ai/proposals';

export type AnswerPart = { text: string } | { raw: string; place: AiProposal } | { raw: string; element: string };

const NAME = String.raw`[\w-]+(?:[\w.-]*[\w-])?`;
const FILE = String.raw`(?:src|tests)\/${NAME}(?:\/${NAME})*|plant-map\.json|scene\.json|zplc\.json`;
const ELEMENT = String.raw`(?:rung|block|step|transition):[A-Za-z0-9_%-]{1,64}`;
const PLACE = new RegExp(String.raw`(?<![\w/.:-])(?:(${FILE})(?::(\d{1,6}))?|(${ELEMENT}))(?![\w/-])`, 'g');

/** The answer cut into plain text and places, in order; joined back, the parts are the answer. */
export function splitPlaces(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(PLACE)) {
    const [raw, path, line, element] = match;
    const at = match.index!;
    // a name inside an address is not a place of the project
    if (/\bhttps?:\/\/\S*$/.test(answer.slice(Math.max(0, at - 200), at))) continue;
    if (at > last) parts.push({ text: answer.slice(last, at) });
    if (element) parts.push({ raw, element });
    else if (line) parts.push({ raw, place: { type: 'goToLine', path: path!, line: Number(line) } });
    else parts.push({ raw, place: { type: 'openFile', path: path! } });
    last = at + raw.length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last) });
  return parts;
}
