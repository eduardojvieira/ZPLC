import { transpileToST } from '../compiler';
import type { PLCLanguage } from '../types';

type Report = (entry: { type: 'error'; message: string; source: 'transpiler' }) => void;

/**
 * The Structured Text that a diagram (FBD, LD, SFC) is translated to, or null when the file is not a diagram or the
 * translation failed; what the translation found is reported, one entry per finding.
 */
export function generateStructuredText(file: { language: PLCLanguage; content: string }, report: Report): string | null {
  if (file.language !== 'FBD' && file.language !== 'LD' && file.language !== 'SFC') return null;
  try {
    const result = transpileToST(file.content, file.language);
    if (!result.success) {
      result.errors.forEach((message) => report({ type: 'error', message, source: 'transpiler' }));
      return null;
    }
    return result.source;
  } catch (e) {
    report({ type: 'error', message: `Transpiler error: ${e instanceof Error ? e.message : String(e)}`, source: 'transpiler' });
    return null;
  }
}
