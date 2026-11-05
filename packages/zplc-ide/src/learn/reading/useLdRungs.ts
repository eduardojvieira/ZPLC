/** The rungs of a Ladder file of a lesson, loaded the way the Ladder editor loads a file (LRN-041). */
import { useMemo } from 'react';
import type { LDRung } from '../../models/ldTypes';
import { loadLDFile } from '../../models/visualFileLoad';

export type LoadedRungs =
  { ok: true; name: string; rungs: LDRung[] } | { ok: false; reason: 'missing' | 'invalid' | 'noRung'; detail: string };

/** The rungs of `files[src]`: all of them, or only the 1-based `rung`. */
export function useLdRungs(files: Record<string, string>, src: string, rung?: number): LoadedRungs {
  const text = files[src];
  return useMemo((): LoadedRungs => {
    if (text === undefined) return { ok: false, reason: 'missing', detail: src };
    const loaded = loadLDFile(src, text);
    if (!loaded.ok) return { ok: false, reason: 'invalid', detail: loaded.error.violations.join(' ') };
    const rungs = rung === undefined ? loaded.model.rungs : loaded.model.rungs.slice(rung - 1, rung);
    return rungs.length === 0 ? { ok: false, reason: 'noRung', detail: String(rung) } : { ok: true, name: loaded.model.name, rungs };
  }, [text, src, rung]);
}
