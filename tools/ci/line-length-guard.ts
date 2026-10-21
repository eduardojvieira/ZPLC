// Line-length guard (VF-017): no hand-written source file has a line longer than the limit.
//
//   bun tools/ci/line-length-guard.ts          list the offending lines and exit 1 when there is any
//
// Prettier and clang-format wrap code at LIMIT columns, but neither breaks a long string literal or re-wraps a
// comment, so this guard is the other half of the rule. It reads the TypeScript, JavaScript, CSS, C and header
// files that tools/ci/format-files.ts selects. JSON is data and Markdown is prose: both are formatted, neither is
// held to the limit (a JSON string and a paragraph cannot be wrapped without changing what they say).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { GUARDED_FILE, ROOT, formattableFiles } from './format-files';

/** The one number: keep it equal to printWidth in .prettierrc.json and ColumnLimit in .clang-format. */
export const LIMIT = 140;

export interface Offender {
  file: string;
  line: number;
  length: number;
}

/**
 * Lines of `text` longer than `limit` characters (code points, as the formatters count). With `generated`, the lines
 * between a `>>> GENERATED` and a `<<< END GENERATED` marker (a block a generator writes into a C file) are skipped.
 */
export function longLines(
  text: string,
  limit: number = LIMIT,
  generated = false,
): Array<{ line: number; length: number }> {
  const found: Array<{ line: number; length: number }> = [];
  let inside = false;
  text.split(/\r?\n/).forEach((content, index) => {
    if (generated && content.startsWith('/* >>> GENERATED')) inside = true;
    // A line of ASCII is the common case: skip the code point split for it
    const length = content.length <= limit ? content.length : [...content].length;
    if (length > limit && !inside) found.push({ line: index + 1, length });
    if (generated && content.startsWith('/* <<< END GENERATED')) inside = false;
  });
  return found;
}

/** The offenders of every guarded file, or of the files named. */
export function offenders(files: string[] = formattableFiles().filter((file) => GUARDED_FILE.test(file))): Offender[] {
  return files.flatMap((file) =>
    longLines(readFileSync(resolve(ROOT, file), 'utf8'), LIMIT, /\.(?:c|h)$/.test(file)).map(({ line, length }) => ({ file, line, length })),
  );
}

if (import.meta.main) {
  const found = offenders();
  for (const { file, line, length } of found) console.error(`${file}:${line}: ${length} columns (limit ${LIMIT})`);
  if (found.length > 0) {
    console.error(`line-length-guard: ${found.length} lines over ${LIMIT} columns. Split the string or wrap the comment.`);
    process.exit(1);
  }
  console.log(`line-length-guard: no line over ${LIMIT} columns`);
}
