/**
 * The review of a change set, as the person sees it. The host already reduced the result (security.ts); this accepts it only
 * when it is a passed run whose change set names exactly the files, kinds and hashes that were asked about.
 */
import type { CandidateChangeSetReviewPresentation } from '../workspaceTestPresentation';
import { record } from '../aiProviderPresentation';

export interface ReviewedFile {
  path: string;
  kind: 'modify' | 'create';
  beforeSha256?: string;
  afterSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const DIAGNOSTIC = /^[A-Z][A-Z0-9_]{0,95}$/;
const TOP_LEVEL = ['schemaVersion', 'accepted', 'evidenceScope', 'changeSet', 'diagnostics', 'evidence', 'savedTestInputIdentity'];

const invalid = (): CandidateChangeSetReviewPresentation => ({ kind: 'invalid', diagnostics: [], artifacts: [] });
const only = (item: Record<string, unknown>, keys: readonly string[]) => Object.keys(item).every((key) => keys.includes(key));
const digest = (value: unknown, maximum: number) => {
  const item = record(value);
  return item &&
    only(item, ['sha256', 'byteLength']) &&
    typeof item.sha256 === 'string' &&
    SHA256.test(item.sha256) &&
    typeof item.byteLength === 'number' &&
    Number.isSafeInteger(item.byteLength) &&
    item.byteLength >= 0 &&
    item.byteLength <= maximum
    ? item.sha256
    : null;
};
const list = (value: unknown, maximum: number): unknown[] | null => {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return null;
    items.push(descriptor.value);
  }
  return items;
};

function boundChanges(value: unknown, expected: readonly ReviewedFile[]): boolean {
  const changeSet = record(value);
  const changes = changeSet && typeof changeSet.sha256 === 'string' && SHA256.test(changeSet.sha256) ? list(changeSet.changes, 8) : null;
  if (!changes || changes.length !== expected.length) return false;
  const seen = new Set<string>();
  for (const raw of changes) {
    const change = record(raw);
    const file = expected.find((candidate) => candidate.path === change?.path);
    if (!change || !file || seen.has(file.path) || change.kind !== file.kind) return false;
    seen.add(file.path);
    if (digest(change.after, 256 * 1024) !== file.afterSha256) return false;
    if (file.kind === 'create' ? !only(change, ['path', 'kind', 'after']) : !only(change, ['path', 'kind', 'before', 'after']))
      return false;
    if (file.kind === 'modify' && digest(change.before, 256 * 1024) !== file.beforeSha256) return false;
  }
  return seen.size === expected.length;
}

export function presentChangeSetReview(value: unknown, expected: readonly ReviewedFile[]): CandidateChangeSetReviewPresentation {
  const result = record(value);
  if (
    !result ||
    !only(result, TOP_LEVEL) ||
    result.schemaVersion !== 1 ||
    typeof result.accepted !== 'boolean' ||
    result.evidenceScope !== 'native-posix-host'
  )
    return invalid();
  const reviewDiagnostics = result.diagnostics === undefined ? [] : list(result.diagnostics, 32);
  const codes: Array<{ code: string }> = [];
  for (const item of reviewDiagnostics ?? [null]) {
    const diagnostic = record(item);
    if (!diagnostic || !only(diagnostic, ['code']) || typeof diagnostic.code !== 'string' || !DIAGNOSTIC.test(diagnostic.code))
      return invalid();
    codes.push({ code: diagnostic.code });
  }
  let artifacts: CandidateChangeSetReviewPresentation['artifacts'] = [];
  let passed = false;
  if (result.evidence !== undefined) {
    const evidence = record(result.evidence);
    const found = evidence && list(evidence.artifacts, 2);
    const diagnostics = evidence && list(evidence.diagnostics, 128);
    if (!evidence || !found || !diagnostics || !only(evidence, ['schemaVersion', 'operation', 'outcome', 'diagnostics', 'artifacts']))
      return invalid();
    if (
      evidence.schemaVersion !== 1 ||
      evidence.operation !== 'test' ||
      (evidence.outcome !== 'passed' && evidence.outcome !== 'failed') ||
      found.length !== 2
    )
      return invalid();
    const projected: CandidateChangeSetReviewPresentation['artifacts'] = [];
    for (const raw of found) {
      const artifact = record(raw);
      const sha = digest(artifact && { sha256: artifact.sha256, byteLength: artifact.byteLength }, 64 * 1024 * 1024);
      if (!artifact || (artifact.kind !== 'zplc' && artifact.kind !== 'trace') || !sha) return invalid();
      projected.push({ kind: artifact.kind, sha256: sha, byteLength: artifact.byteLength as number });
    }
    if (new Set(projected.map((artifact) => artifact.kind)).size !== 2) return invalid();
    for (const raw of diagnostics) {
      const diagnostic = record(raw);
      if (!diagnostic || typeof diagnostic.code !== 'string' || !DIAGNOSTIC.test(diagnostic.code)) return invalid();
      codes.push({ code: diagnostic.code });
    }
    artifacts = projected;
    passed = evidence.outcome === 'passed' && diagnostics.length === 0;
  }
  let savedTestInputIdentity: CandidateChangeSetReviewPresentation['savedTestInputIdentity'];
  if (result.savedTestInputIdentity !== undefined) {
    const identity = record(result.savedTestInputIdentity);
    if (
      !identity ||
      !only(identity, ['schemaVersion', 'sha256', 'fileCount']) ||
      identity.schemaVersion !== 1 ||
      typeof identity.sha256 !== 'string' ||
      !SHA256.test(identity.sha256) ||
      typeof identity.fileCount !== 'number' ||
      !Number.isSafeInteger(identity.fileCount) ||
      identity.fileCount < 1
    )
      return invalid();
    savedTestInputIdentity = { schemaVersion: 1, sha256: identity.sha256, fileCount: identity.fileCount };
  }
  if (result.accepted)
    return passed && savedTestInputIdentity && boundChanges(result.changeSet, expected)
      ? { kind: 'accepted', diagnostics: [], artifacts, savedTestInputIdentity }
      : invalid();
  return { kind: 'rejected', diagnostics: codes, artifacts, ...(savedTestInputIdentity ? { savedTestInputIdentity } : {}) };
}
