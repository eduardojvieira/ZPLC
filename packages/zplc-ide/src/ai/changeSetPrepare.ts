/**
 * What an assistant proposes is checked and normalized before a person reviews it (IDE-030): a Ladder, FBD or SFC file has to
 * load as the editors load it and is written in their byte-stable form; the manifest is written as Studio writes it and may not
 * hold a credential. One file that does not pass makes the whole set invalid, with the violations to show.
 */
import { loadFBDFile, loadLDFile, loadSFCFile, type VisualFileLoad } from '../models/visualFileLoad';
import { serializeVisualDocument } from '../models/visualFileFormat';
import { parseAndMigrateProject } from '../project/projectModel';
import { manifestSensitivePaths } from './manifestPrivacy';

export interface ProposedChange {
  path: string;
  kind: 'modify' | 'create';
  content: string;
  /** The sha256 of the file this one replaces, as the host read it when it answered; a new file has none. */
  baselineSha256?: string;
}
export type PrepareResult =
  { ok: true; changes: ProposedChange[] } | { ok: false; reason: 'invalid-file' | 'sensitive-field'; path: string; violations: string[] };

const refusal = (reason: 'invalid-file' | 'sensitive-field', path: string, violations: string[] = []): PrepareResult => ({
  ok: false,
  reason,
  path,
  violations,
});

function normalizeVisual(path: string, content: string): { content: string } | { violations: string[] } {
  const loaded: VisualFileLoad<unknown> = path.endsWith('.ld.json')
    ? loadLDFile(path, content)
    : path.endsWith('.fbd.json')
      ? loadFBDFile(path, content)
      : loadSFCFile(path, content);
  return loaded.ok ? { content: serializeVisualDocument(loaded.model) } : { violations: loaded.error.violations };
}

/** The manifest as `writeProjectConfig` writes it: migrated to the current schema, two-space JSON without a final newline. */
export function canonicalManifest(value: unknown): { content: string } | { violations: string[] } {
  const parsed = parseAndMigrateProject(value);
  return parsed.ok
    ? { content: JSON.stringify(parsed.project, null, 2) }
    : { violations: parsed.diagnostics.slice(0, 5).map(({ path, message }) => `${path}: ${message}`) };
}

export function prepareChangeSet(changes: readonly ProposedChange[]): PrepareResult {
  const prepared: ProposedChange[] = [];
  for (const change of changes) {
    if (change.path === 'zplc.json') {
      let value: unknown;
      try {
        value = JSON.parse(change.content);
      } catch {
        return refusal('invalid-file', change.path, ['not valid JSON']);
      }
      if (manifestSensitivePaths(value).length > 0) return refusal('sensitive-field', change.path);
      const manifest = canonicalManifest(value);
      if ('violations' in manifest) return refusal('invalid-file', change.path, manifest.violations);
      prepared.push({ ...change, content: manifest.content });
    } else if (/\.(ld|fbd|sfc)\.json$/.test(change.path)) {
      const visual = normalizeVisual(change.path, change.content);
      if ('violations' in visual) return refusal('invalid-file', change.path, visual.violations);
      prepared.push({ ...change, content: visual.content });
    } else prepared.push({ ...change });
  }
  return { ok: true, changes: prepared };
}
