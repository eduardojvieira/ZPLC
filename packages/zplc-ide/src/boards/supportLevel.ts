/**
 * The support level of a board, derived from the evidence records that the board manifest references (IO-015).
 * The level is never a field of the manifest; this is the same rule as support_level_from_records in
 * firmware/zephyr/scripts/zplc_boards.py, which the docs and CI use.
 */
export type SupportLevel = 'cross-build' | 'human-hil';

export interface SupportRecord {
  readonly ref: string;
  readonly firmwareVersion: string;
  readonly commit: string;
  readonly result: 'pass' | 'fail';
}

export interface SupportLevelResult {
  readonly level: SupportLevel;
  readonly records: readonly SupportRecord[];
}

export const HIL_RECORD_SCHEMA = 'zplc.hil-record/1';
/** The only evidence level that raises a support level; `emulated` and `community-reported` never do (HIL contract). */
export const HARDWARE_LEVEL = 'hardware';

/**
 * The record's `evidence_level`; a record written before the level existed says `evidence`. A record that says neither
 * names no level, and never counts as hardware evidence (HIL-009).
 */
function evidenceLevel(record: Record<string, unknown>): unknown {
  if ('evidence_level' in record) return record.evidence_level;
  return 'evidence' in record ? record.evidence : undefined;
}

function asApplicableRecord(boardId: string, value: unknown): { firmwareVersion: string; commit: string; result: 'pass' | 'fail' } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { schema, board_id: board, firmware_version: version, commit, image_sha256: hash, result } = record;
  if (schema !== HIL_RECORD_SCHEMA || board !== boardId) return undefined;
  if (evidenceLevel(record) !== HARDWARE_LEVEL) return undefined; // an emulated or reported run never raises the level
  if (typeof version !== 'string' || version.trim() === '') return undefined;
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) return undefined;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return undefined;
  if (result !== 'pass' && result !== 'fail') return undefined;
  return { firmwareVersion: version, commit, result };
}

/** `records` pairs each manifest reference with the parsed JSON of the record file (null when it could not be read). */
export function supportLevelFromRecords(boardId: string, records: ReadonlyArray<readonly [string, unknown]>): SupportLevelResult {
  const applicable: SupportRecord[] = [];
  for (const [ref, value] of records) {
    const record = asApplicableRecord(boardId, value);
    if (record) applicable.push({ ref, ...record });
  }
  return { level: applicable.some((entry) => entry.result === 'pass') ? 'human-hil' : 'cross-build', records: applicable };
}

/**
 * The level of a board whose records are files: `readText` returns the text of the file a manifest reference names, or
 * undefined when it cannot be read. A file that is missing, unreadable or not JSON leaves the board at cross-build.
 */
export async function supportLevelFromFiles(
  boardId: string,
  refs: readonly string[],
  readText: (ref: string) => Promise<string | undefined>,
): Promise<SupportLevel> {
  const records: Array<readonly [string, unknown]> = [];
  for (const ref of refs) {
    let value: unknown = null;
    try { value = JSON.parse((await readText(ref)) ?? 'null'); } catch { value = null; }
    records.push([ref, value]);
  }
  return supportLevelFromRecords(boardId, records).level;
}
