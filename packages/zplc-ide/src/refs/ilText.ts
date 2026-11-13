/** Names and addresses of an Instruction List file as occurrences (plan-u2.md, FND-004). */
import { ilLineElement } from '../models/sourceElements';
import type { Occurrence, OccurrenceRole } from './contracts';

const WRITES = new Set(['ST', 'STN', 'S', 'R', 'SET', 'RESET']);
const LITERAL_WORDS = new Set(['TRUE', 'FALSE', 'NOT', 'AND', 'OR', 'XOR', 'MOD']);
const NAME = /[A-Za-z_][A-Za-z0-9_]*/g;
const OPERAND = /T#[\w.:]+|\d+#\w+|'[^']*'|%[A-Za-z0-9.]+|[A-Za-z_]\w*(?:\s*:=)?|\.\s*[A-Za-z_]\w*/gi;

/** Blank out `(* ... *)` comments, keeping every offset and newline where it was. */
function maskComments(text: string): string {
  return text.replace(/\(\*[\s\S]*?(\*\)|$)/g, (m) => m.replace(/[^\n]/g, ' '));
}

export function ilOccurrences(file: string, content: string): Occurrence[] {
  const found: Occurrence[] = [];
  let inVar = false;
  maskComments(content)
    .split('\n')
    .forEach((raw, i) => {
      const line = i + 1;
      const opensVar = /^\s*VAR\w*\b/i.test(raw);
      if (opensVar) inVar = true;
      else if (/^\s*END_VAR\b/i.test(raw)) {
        inVar = false;
        return;
      }
      if (inVar) {
        // One declaration per line; `a, b : INT` yields both names. ponytail: a declaration split over lines is not read.
        const text = opensVar ? raw.replace(/^\s*VAR\w*(\s+(RETAIN|CONSTANT))*/i, (s) => ' '.repeat(s.length)) : raw;
        const decl = /^(\s*)([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?:AT\s+(%[A-Za-z0-9.]+))?\s*:/i.exec(text);
        if (!decl) return;
        const head = decl[1]!.length;
        for (const m of decl[2]!.matchAll(NAME))
          found.push({
            language: 'IL',
            place: { kind: 'text', file, line, column: head + m.index! + 1, length: m[0].length },
            role: 'declaration',
            text: m[0],
          });
        if (decl[3]) {
          const column = raw.indexOf(decl[3], head) + 1;
          const place = { kind: 'text' as const, file, line, column, length: decl[3].length };
          found.push({ language: 'IL', place, role: 'binding', text: decl[3] });
        }
        return;
      }
      if (/^\s*(PROGRAM|FUNCTION_BLOCK|FUNCTION|END_\w+)\b/i.test(raw)) return;
      // Body: drop a `;` comment, then optional label, operator, operands.
      const semi = raw.indexOf(';');
      const code = semi < 0 ? raw : raw.slice(0, semi);
      const label = /^\s*[A-Za-z_]\w*\s*:(?!=)/.exec(code);
      const from = label ? label[0].length : 0;
      const op = /^\s*([A-Za-z_]\w*)/.exec(code.slice(from));
      let operator = '';
      let rest = from;
      // A line that starts with `Name :=` is a parameter of an open CAL, not an operator.
      if (op && !/^\s*:=/.test(code.slice(from + op[0].length))) {
        operator = op[1]!.toUpperCase();
        rest = from + op[0].length;
      }
      const role: OccurrenceRole = WRITES.has(operator) ? 'write' : 'use';
      for (const m of code.slice(rest).matchAll(OPERAND)) {
        const word = m[0];
        if (!/^[A-Za-z_]\w*$/.test(word.replace(/\s*:=$/, '')) || /:=$/.test(word) || LITERAL_WORDS.has(word.toUpperCase())) continue;
        found.push({
          language: 'IL',
          place: { kind: 'element', file, element: ilLineElement(line), field: `operand:${rest + m.index! + 1}` },
          role,
          text: word,
        });
      }
    });
  return found;
}
