export type WorkspaceSafetyPair = { outputs: [string, string] };

export type WorkspaceSafetyPresentation =
  | { kind: 'not-configured'; declared: [] }
  | { kind: 'covered'; declared: WorkspaceSafetyPair[] }
  | { kind: 'uncovered'; declared: WorkspaceSafetyPair[]; uncovered: WorkspaceSafetyPair[] }
  | { kind: 'invalid'; diagnostics: Array<{ code: string; path?: string }> };

const SIGNAL = /^[A-Za-z_][A-Za-z0-9_]{0,63}\.[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DIAGNOSTICS = new Set(['SAFETY_OUTPUT_INVALID', 'SAFETY_OUTPUT_DUPLICATE', 'SAFETY_INTERLOCK_UNCOVERED', 'SAFETY_SCENARIO_INVALID', 'SAFETY_SCENARIOS_UNAVAILABLE', 'WORKSPACE_INVALID', 'WORKSPACE_MISSING', 'WORKSPACE_INVALID_DIRECTORY', 'WORKSPACE_SYMLINK', 'WORKSPACE_INVALID_FILE', 'WORKSPACE_READ_FAILED', 'WORKSPACE_LIMIT', 'PROJECT_INVALID', 'PROGRAM_NOT_FOUND', 'COMPILATION_FAILED']);

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((descriptor) => !('value' in descriptor))) return null;
    return descriptors as Record<string, unknown>;
  } catch { return null; }
}

function valueOf(recordValue: Record<string, unknown>, key: string): unknown {
  const descriptor = recordValue[key] as PropertyDescriptor | undefined;
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  const item = record(value);
  return item && Object.keys(item).length === keys.length && keys.every((key) => Object.hasOwn(item, key)) ? item : null;
}

function array(value: unknown, maximum: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value); const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1 || Object.values(descriptors).some((descriptor) => !('value' in descriptor))) return null;
    return Array.from({ length }, (_, index) => (descriptors[String(index)] as PropertyDescriptor).value);
  } catch { return null; }
}

function pair(value: unknown): WorkspaceSafetyPair | null {
  const item = exact(value, ['outputs']); const outputs = item && array(valueOf(item, 'outputs'), 2);
  if (!outputs || outputs.length !== 2 || !outputs.every((output) => typeof output === 'string' && output.length <= 128 && SIGNAL.test(output)) || outputs[0] === outputs[1]) return null;
  return { outputs: [outputs[0] as string, outputs[1] as string] };
}

function pairKey(value: WorkspaceSafetyPair): string { return [...value.outputs].sort().join('\0'); }

function pairs(value: unknown): WorkspaceSafetyPair[] | null {
  const values = array(value, 64); if (!values) return null;
  const result = values.map(pair);
  return result.some((item) => item === null) || new Set(result.map((item) => pairKey(item!))).size !== result.length ? null : result as WorkspaceSafetyPair[];
}

function diagnostics(value: unknown): Array<{ code: string; path?: string }> | null {
  const values = array(value, 64); if (!values) return null;
  const result: Array<{ code: string; path?: string }> = [];
  for (const value of values) {
    const item = record(value); const code = item && valueOf(item, 'code'); const path = item && valueOf(item, 'path');
    if (!item || typeof code !== 'string' || !DIAGNOSTICS.has(code) || (path !== undefined && (typeof path !== 'string' || path.length === 0 || path.length > 512 || path.includes('\0') || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path) || path.split(/[\\/]/).includes('..')))) return null;
    if (Object.keys(item).length !== (path === undefined ? 1 : 2) || !Object.hasOwn(item, 'code') || (path !== undefined && !Object.hasOwn(item, 'path'))) return null;
    result.push(path === undefined ? { code } : { code, path });
  }
  return result;
}

/** Renderer defense in depth for the already-sanitized main-process interlock report. */
export function presentWorkspaceSafetyCheck(value: unknown): WorkspaceSafetyPresentation {
  const invalid = (diagnostics: Array<{ code: string; path?: string }> = []): WorkspaceSafetyPresentation => ({ kind: 'invalid', diagnostics });
  const result = record(value); const ok = result && valueOf(result, 'ok'); const evidence = result && exact(valueOf(result, 'evidence'), ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts']); const artifacts = evidence && array(valueOf(evidence, 'artifacts'), 0);
  if (!result || typeof ok !== 'boolean' || !evidence || valueOf(evidence, 'schemaVersion') !== 1 || valueOf(evidence, 'operation') !== 'safety-check' || !artifacts || artifacts.length !== 0) return invalid();
  const parsedDiagnostics = diagnostics(valueOf(evidence, 'diagnostics')); const outcome = valueOf(evidence, 'outcome');
  if (!parsedDiagnostics || (outcome !== 'passed' && outcome !== 'failed')) return invalid();
  const summaryValue = valueOf(result, 'summary');
  if (summaryValue === undefined) return !ok && outcome === 'failed' && parsedDiagnostics.length > 0 && Object.keys(result).length === 2 ? invalid(parsedDiagnostics) : invalid();
  const summary = exact(summaryValue, ['configured', 'declared', 'covered', 'uncovered']); const configured = summary && valueOf(summary, 'configured'); const declared = summary && pairs(valueOf(summary, 'declared')); const covered = summary && pairs(valueOf(summary, 'covered')); const uncovered = summary && pairs(valueOf(summary, 'uncovered'));
  if (!summary || typeof configured !== 'boolean' || !declared || !covered || !uncovered || Object.keys(result).length !== 3) return invalid();
  const declaredKeys = new Set(declared.map(pairKey)); const partition = [...covered, ...uncovered].map(pairKey);
  const uncoveredDiagnostic = parsedDiagnostics.length === 1 && parsedDiagnostics[0]?.code === 'SAFETY_INTERLOCK_UNCOVERED' && parsedDiagnostics[0].path === undefined;
  if (partition.length !== declared.length || new Set(partition).size !== partition.length || partition.some((key) => !declaredKeys.has(key)) || (!configured && declared.length !== 0) || (configured && declared.length === 0) || ok !== (uncovered.length === 0) || (outcome === 'passed') !== ok || (ok ? parsedDiagnostics.length !== 0 : !uncoveredDiagnostic)) return invalid();
  if (!configured) return { kind: 'not-configured', declared: [] };
  return uncovered.length === 0 ? { kind: 'covered', declared } : { kind: 'uncovered', declared, uncovered };
}
