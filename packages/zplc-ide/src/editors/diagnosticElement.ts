/**
 * The element of a diagram that a build diagnostic is about (LNG-003), for the Problems panel to select.
 *
 * The build reports a position in the Structured Text that the diagram is translated to, and the message of what the
 * translation found; the transpiler that made the Structured Text knows which element each line and each finding
 * belongs to, so the same transpilation of the open file answers.
 */

import { transpileToST } from '../compiler';
import { elementAtLine, isSourceElementId, type SourceElementId } from '../models/sourceElements';
import type { ProjectBlock } from '../models/projectBlocks';
import type { PLCLanguage } from '../types';

export function elementOfDiagnostic(
  file: { language: PLCLanguage; content: string },
  diagnostic: { message: string; line?: number },
  projectBlocks?: readonly ProjectBlock[],
): SourceElementId | undefined {
  if (file.language !== 'LD' && file.language !== 'FBD' && file.language !== 'SFC') return undefined;
  const translated = transpileToST(file.content, file.language, undefined, projectBlocks);
  if (!translated.success) {
    // what the translation found: the message of the build is that message, possibly led by the element and followed by a position
    return translated.diagnostics?.find((found) => found.element !== undefined && diagnostic.message.includes(found.message))?.element;
  }
  return diagnostic.line === undefined || diagnostic.line < 1 ? undefined : elementAtLine(translated.sourceMap, diagnostic.line);
}

/**
 * The element a Problems entry selects when it is opened: the one the build carried with the diagnostic (it names the
 * element the Tool API attached, whatever the file open in the window holds now), else the one the translation of the
 * open file gives.
 */
export function elementToSelect(
  diagnostic: { message: string; line?: number; element?: string },
  file: { language: PLCLanguage; content: string } | undefined,
  projectBlocks?: readonly ProjectBlock[],
): SourceElementId | undefined {
  if (isSourceElementId(diagnostic.element)) return diagnostic.element;
  return file ? elementOfDiagnostic(file, diagnostic, projectBlocks) : undefined;
}
