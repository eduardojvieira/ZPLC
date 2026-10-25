import { describe, expect, it } from 'bun:test';
import { presentChangeSetReview } from './changeSetPresentation';

const sha = (character: string) => character.repeat(64);
const files = [
  { path: 'src/Lamp.st', kind: 'create' as const, afterSha256: sha('c') },
  { path: 'src/Main.st', kind: 'modify' as const, beforeSha256: sha('a'), afterSha256: sha('b') },
  { path: 'zplc.json', kind: 'modify' as const, beforeSha256: sha('d'), afterSha256: sha('e') },
];
const entry = (file: (typeof files)[number]) => ({
  path: file.path,
  kind: file.kind,
  ...(file.kind === 'modify' ? { before: { sha256: file.beforeSha256, byteLength: 5 } } : {}),
  after: { sha256: file.afterSha256, byteLength: 6 },
});
const evidence = (outcome: 'passed' | 'failed' = 'passed', diagnostics: unknown[] = []) => ({
  schemaVersion: 1,
  operation: 'test',
  outcome,
  diagnostics,
  artifacts: [
    { kind: 'zplc', sha256: sha('1'), byteLength: 10 },
    { kind: 'trace', sha256: sha('2'), byteLength: 20 },
  ],
});
const accepted = () => ({
  schemaVersion: 1,
  accepted: true,
  evidenceScope: 'native-posix-host',
  changeSet: { sha256: sha('f'), changes: files.map(entry) },
  evidence: evidence(),
  savedTestInputIdentity: { schemaVersion: 1, sha256: sha('3'), fileCount: 3 },
});

describe('the review of a change set is accepted only for exactly the files and bytes that were asked about (S5)', () => {
  it('accepts a passed run of exactly the files, kinds and hashes that were sent', () => {
    expect(presentChangeSetReview(accepted(), files)).toMatchObject({
      kind: 'accepted',
      diagnostics: [],
      artifacts: [{ kind: 'zplc' }, { kind: 'trace' }],
      savedTestInputIdentity: { fileCount: 3 },
    });
  });

  it('does not accept a review of other files, other bytes, another kind, or an incomplete run', () => {
    const base = accepted();
    const withChanges = (changes: unknown[]) => ({ ...base, changeSet: { ...base.changeSet, changes } });
    const [lamp, main, manifest] = base.changeSet.changes;
    for (const value of [
      withChanges([lamp, main]),
      withChanges([lamp, main, manifest, { ...lamp, path: 'src/Extra.st' }]),
      withChanges([{ ...lamp, kind: 'modify', before: { sha256: sha('a'), byteLength: 1 } }, main, manifest]),
      withChanges([lamp, { ...main, after: { sha256: sha('9'), byteLength: 6 } }, manifest]),
      withChanges([lamp, { ...main, before: { sha256: sha('9'), byteLength: 5 } }, manifest]),
      withChanges([lamp, lamp, manifest]),
      { ...base, evidence: evidence('failed') },
      { ...base, evidence: evidence('passed', [{ code: 'SCENARIO_ASSERTION_FAILED' }]) },
      { ...base, evidence: { ...evidence(), artifacts: [evidence().artifacts[0]] } },
      { ...base, savedTestInputIdentity: undefined },
      { ...base, evidenceScope: 'hardware' },
      { ...base, extra: true },
      null,
    ])
      expect(presentChangeSetReview(value, files).kind, JSON.stringify(value)?.slice(0, 80)).toBe('invalid');
  });

  it('shows a refused review with its diagnostics, among them that a manifest took a credential', () => {
    const refused = presentChangeSetReview(
      {
        schemaVersion: 1,
        accepted: false,
        evidenceScope: 'native-posix-host',
        diagnostics: [{ code: 'CHANGESET_SENSITIVE_FIELD' }],
      },
      files,
    );
    expect(refused).toEqual({ kind: 'rejected', diagnostics: [{ code: 'CHANGESET_SENSITIVE_FIELD' }], artifacts: [] });
    const failed = presentChangeSetReview(
      { ...accepted(), accepted: false, evidence: evidence('failed', [{ code: 'SCENARIO_ASSERTION_FAILED', path: 'tests/a.json' }]) },
      files,
    );
    expect(failed).toMatchObject({ kind: 'rejected', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED' }] });
    expect(
      presentChangeSetReview(
        { schemaVersion: 1, accepted: false, evidenceScope: 'native-posix-host', diagnostics: [{ code: 'lower' }] },
        files,
      ).kind,
    ).toBe('invalid');
  });
});
