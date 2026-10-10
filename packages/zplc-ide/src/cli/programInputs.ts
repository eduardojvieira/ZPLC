import { parse, transpileToST, type DebugMap } from '../compiler';
import { INPUT_TAG } from '../runtime/declaredInputs';
import type { PLCLanguage } from '../types';

/**
 * Marks, in the debug map, the VAR_INPUT variables of every program that have no direct address (IDE-024): the map has no
 * section, and Studio lists the declared inputs of the running program from it. A program that cannot be read again is
 * left unmarked (the build has already accepted it).
 */
export function markProgramInputs(debugMap: DebugMap, sources: ReadonlyArray<{ language: PLCLanguage; content: string; sourceRef: string }>): void {
  const namesByFile = new Map<string, Set<string>>();
  for (const source of sources) {
    const text = source.language === 'ST' ? source.content : (() => { const transpiled = transpileToST(source.content, source.language); return transpiled.success ? transpiled.source : undefined; })();
    if (text === undefined) continue;
    try {
      const names = namesByFile.get(source.sourceRef) ?? new Set<string>();
      for (const program of parse(text).programs) {
        for (const block of program.varBlocks) if (block.section === 'VAR_INPUT') for (const variable of block.variables) names.add(variable.name);
      }
      namesByFile.set(source.sourceRef, names);
    } catch { /* the build accepted it; an unreadable source simply has no marked inputs */ }
  }
  for (const info of Object.values(debugMap.pou)) {
    const names = info.sourceRef === undefined ? undefined : namesByFile.get(info.sourceRef);
    if (!names) continue;
    for (const name of names) {
      const variable = info.vars[name];
      if (variable && variable.region === 'WORK' && variable.children === undefined) variable.tags = { ...(variable.tags ?? {}), [INPUT_TAG]: true };
    }
  }
}
