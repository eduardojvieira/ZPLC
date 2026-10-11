/**
 * The errors and warnings of the open project, while the author types (LNG-015).
 *
 * They come from the compiler's own front end (`checkProject`): the syntax errors of every file, each with its range,
 * and the semantic errors the build would report, in every file, not only the one in the editor. Nothing is built.
 * A diagnostic is cleared the next time the project is checked and the error is gone.
 */

import { checkProject, type CheckOptions } from '@zplc/compiler';
import type { STLiveDiagnostic } from '../types';
import type { ProjectFile } from './projectIndex';

/** A file past this size is not read by the live check (the build reads it); the editor says so for its own buffer. */
export const LIVE_CHECK_FILE_LIMIT = 200_000;
/** The whole project past this many characters is not checked live. */
export const LIVE_CHECK_PROJECT_LIMIT = 2_000_000;

const sourceLimit = (path: string): STLiveDiagnostic => ({
  code: 'ST_SOURCE_LIMIT', type: 'warning', file: path,
  message: `Live ST analysis skipped for files over ${LIVE_CHECK_FILE_LIMIT.toLocaleString()} characters.`,
});

/**
 * The diagnostics of every file of the project, those of `active` first. A file past the limit is left out and the
 * active one says that it was.
 */
export function liveDiagnostics(files: readonly ProjectFile[], active: string | undefined, options: CheckOptions = {}): STLiveDiagnostic[] {
  const skipped = files.filter((file) => file.content.length > LIVE_CHECK_FILE_LIMIT);
  const readable = files.filter((file) => file.content.length <= LIVE_CHECK_FILE_LIMIT);
  const total = readable.reduce((sum, file) => sum + file.content.length, 0);
  if (total > LIVE_CHECK_PROJECT_LIMIT) return skipped.filter((file) => file.path === active).map((file) => sourceLimit(file.path));

  const found: STLiveDiagnostic[] = [];
  try {
    for (const diagnostic of checkProject(readable.map((file) => ({ ref: file.path, content: file.content })), options)) {
      found.push({
        code: diagnostic.severity === 'warning' ? 'ST_WARNING' : diagnostic.phase === 'lexer' ? 'ST_LEXER' : diagnostic.phase === 'parser' ? 'ST_PARSER' : 'ST_SEMANTIC',
        type: diagnostic.severity,
        message: diagnostic.message,
        file: diagnostic.ref,
        line: diagnostic.line,
        column: diagnostic.column,
        ...(diagnostic.endLine === undefined ? {} : { endLine: diagnostic.endLine, endColumn: diagnostic.endColumn }),
      });
    }
  } catch {
    return [{ code: 'ST_ANALYSIS_UNAVAILABLE', type: 'warning', message: 'Live ST analysis is temporarily unavailable.' }];
  }
  for (const file of skipped) if (file.path === active) found.push(sourceLimit(file.path));
  // the active file first: it is the one the author is looking at; each file keeps the order of its lines
  return [...found.filter((each) => each.file === active), ...found.filter((each) => each.file !== active)];
}

/** The diagnostics that are about `path`. */
export function diagnosticsOf(all: readonly STLiveDiagnostic[], path: string): STLiveDiagnostic[] {
  return all.filter((each) => each.file === path || each.file === undefined);
}
