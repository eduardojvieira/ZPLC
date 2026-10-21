/**
 * The difference a project shows before it is migrated (IDE-022): the text of zplc.json as it is on disk against the
 * text Save writes (`JSON.stringify(config, null, 2)`, as `writeProjectConfig` does), compared line by line.
 * Migration changes only zplc.json: the sources of a version 1 project are the sources of a version 2 one.
 */
import type { ZPLCProjectConfig } from '../types';

export interface DiffLine {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/** Beyond this many line pairs in the part that differs, the comparison reports the whole part as replaced. */
const COMPARISON_BUDGET = 4_000_000;

const linesOf = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines;
};

/**
 * A longest-common-subsequence comparison of the lines of two texts. Lines that both texts start and end with are
 * kept without comparing; what is left is compared in full unless it is too large, in which case it is reported as
 * removed and added, which is a correct if coarse answer.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const left = linesOf(before);
  const right = linesOf(after);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }

  const out: DiffLine[] = left.slice(0, start).map((text) => ({ kind: 'same', text }));
  const a = left.slice(start, leftEnd);
  const b = right.slice(start, rightEnd);
  if (a.length * b.length > COMPARISON_BUDGET) {
    out.push(...a.map((text): DiffLine => ({ kind: 'removed', text })), ...b.map((text): DiffLine => ({ kind: 'added', text })));
  } else {
    // common[i][j]: the length of the longest common subsequence of a[i..] and b[j..].
    const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        out.push({ kind: 'same', text: a[i]! });
        i += 1;
        j += 1;
      } else if (j >= b.length || (i < a.length && common[i + 1]![j]! >= common[i]![j + 1]!)) {
        out.push({ kind: 'removed', text: a[i]! });
        i += 1;
      } else {
        out.push({ kind: 'added', text: b[j]! });
        j += 1;
      }
    }
  }
  out.push(...left.slice(leftEnd).map((text): DiffLine => ({ kind: 'same', text })));
  return out;
}

/** The changed lines in groups, each with `context` unchanged lines on both sides; groups that touch are one. */
export function changedHunks(lines: readonly DiffLine[], context = 2): DiffLine[][] {
  const ranges: Array<[number, number]> = [];
  lines.forEach((line, index) => {
    if (line.kind === 'same') return;
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length, index + context + 1);
    const last = ranges.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else ranges.push([from, to]);
  });
  return ranges.map(([from, to]) => lines.slice(from, to).map((line) => ({ ...line })));
}

export interface MigrationDifference {
  file: 'zplc.json';
  changed: boolean;
  removed: number;
  added: number;
  hunks: DiffLine[][];
}

/** What saving `config` would change in the zplc.json whose text is `before`. */
export function describeMigration(before: string, config: ZPLCProjectConfig): MigrationDifference {
  const lines = diffLines(before, JSON.stringify(config, null, 2));
  const removed = lines.filter((line) => line.kind === 'removed').length;
  const added = lines.filter((line) => line.kind === 'added').length;
  return { file: 'zplc.json', changed: removed + added > 0, removed, added, hunks: changedHunks(lines) };
}
