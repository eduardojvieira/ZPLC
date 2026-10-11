// REL-030, REL-031: what a run of the release workflow is allowed to do is decided by a script, so that it can be
// tested with the events the workflow receives instead of reading the workflow's text.
import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRelease, type ReleaseEvent } from './resolve-release';

const base: ReleaseEvent = {
  eventName: 'workflow_dispatch',
  ref: 'refs/heads/main',
  refName: 'main',
  requestedVersion: '2.0.0-rc.4',
  rehearsal: true,
  canonicalVersion: '2.0.0-rc.4',
};
const root = join(import.meta.dir, '..', '..');

describe('a rehearsal publishes nothing (REL-030)', () => {
  test('a manual run with the rehearsal input set resolves the identity and publishes nothing, from any ref', () => {
    expect(resolveRelease(base)).toEqual({ version: '2.0.0-rc.4', tag: 'v2.0.0-rc.4', publishing: false });
  });

  test('stays a rehearsal even on the release tag itself', () => {
    expect(resolveRelease({ ...base, ref: 'refs/tags/v2.0.0-rc.4', refName: 'v2.0.0-rc.4' }).publishing).toBe(false);
  });

  test('a manual run that publishes must be on the exact tag of the canonical version', () => {
    expect(() => resolveRelease({ ...base, rehearsal: false })).toThrow(/refs\/tags\/v2\.0\.0-rc\.4/);
    const published = resolveRelease({ ...base, rehearsal: false, ref: 'refs/tags/v2.0.0-rc.4', refName: 'v2.0.0-rc.4' });
    expect(published).toEqual({ version: '2.0.0-rc.4', tag: 'v2.0.0-rc.4', publishing: true });
  });

  test('the push of a version tag publishes, and its tag must be the canonical version', () => {
    const push: ReleaseEvent = { eventName: 'push', ref: 'refs/tags/v2.0.0-rc.4', refName: 'v2.0.0-rc.4', requestedVersion: '', rehearsal: false, canonicalVersion: '2.0.0-rc.4' };
    expect(resolveRelease(push).publishing).toBe(true);
    expect(() => resolveRelease({ ...push, refName: 'v2.0.0-rc.5', ref: 'refs/tags/v2.0.0-rc.5' })).toThrow(/does not match/);
  });

  test('a requested version that is not the version of package.json is refused', () => {
    expect(() => resolveRelease({ ...base, requestedVersion: '2.0.0-rc.5' })).toThrow(/does not match canonical package\.json version 2\.0\.0-rc\.4/);
  });
});

describe('prerelease tags continue the rc sequence (REL-031)', () => {
  test.each(['2.0.0-alpha.1', '2.0.0-beta.2', '2.0.0-preview.1', '2.0.0-rc', '2.0.0-rc.0x'])('refuses %s', (version) => {
    expect(() => resolveRelease({ ...base, requestedVersion: version, canonicalVersion: version })).toThrow(/rc\.<n>/);
  });

  test('refuses an rc number below the last tagged one of 2.0.0', () => {
    expect(() => resolveRelease({ ...base, requestedVersion: '2.0.0-rc.2', canonicalVersion: '2.0.0-rc.2' })).toThrow(/after 2\.0\.0-rc\.3/);
  });

  test.each(['2.0.0-rc.3', '2.0.0-rc.4', '2.0.0-rc.12', '2.0.0', '2.1.0-rc.1'])('accepts %s', (version) => {
    expect(resolveRelease({ ...base, requestedVersion: version, canonicalVersion: version }).version).toBe(version);
  });
});

describe('the command line (REL-030)', () => {
  const run = (env: Record<string, string>) => {
    const outputs = join(mkdtempSync(join(tmpdir(), 'zplc-resolve-')), 'github-output');
    writeFileSync(outputs, '');
    const result = spawnSync('bun', ['scripts/release/resolve-release.ts'], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH!, GITHUB_OUTPUT: outputs, ...env },
    });
    return { ...result, outputs: readFileSync(outputs, 'utf8') };
  };
  const canonical = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;

  test('writes version, tag and publishing to GITHUB_OUTPUT for a rehearsal', () => {
    const result = run({ EVENT_NAME: 'workflow_dispatch', EVENT_REF: 'refs/heads/some-branch', REF_NAME: 'some-branch', REQUESTED_VERSION: canonical, REHEARSAL: 'true' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.outputs).toBe(`version=${canonical}\ntag=v${canonical}\npublishing=false\n`);
  });

  test('exits 1 and writes nothing when a manual run would publish from a branch', () => {
    const result = run({ EVENT_NAME: 'workflow_dispatch', EVENT_REF: 'refs/heads/some-branch', REF_NAME: 'some-branch', REQUESTED_VERSION: canonical, REHEARSAL: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`refs/tags/v${canonical}`);
    expect(result.outputs).toBe('');
  });
});
