import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { parseBuildIdentity, parseIdentityText } from '../src/link';
import { firmwareIdentity, serialHash, sha256, summarize, validate } from '../src/record';
import type { RunRecord } from '../src/record';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const python = Bun.which('python3');

function record(): RunRecord {
  return {
    schema: 'zplc.hil.run-record/1', run_id: 'a'.repeat(32), kind: 'scenario', evidence: 'hardware', result: 'pass',
    started_at: '2026-10-10T12:00:00.000Z', ended_at: '2026-10-10T12:00:05.000Z',
    board: { id: 'rpi_pico', zephyr_board: 'rpi_pico/rp2040' },
    device: { reported_board: 'rpi_pico', link: 'serial' }, firmware: {},
    tools: { harness: '1', platform: 'test' }, operator: { name: 'A. Person' },
    steps: [{ id: 'scenario', title: 'Scenario', kind: 'automatic', result: 'pass' }], tests: [], logs: [],
  };
}

describe('the run record (HIL-009)', () => {
  test('a complete record is valid, and firmware fields may all be absent until the image reports them', () => {
    expect(validate(record())).toEqual([]);
    expect(validate({ ...record(), firmware: { commit: null, version: null, image_sha256: null } })).toEqual([]);
  });

  test('a missing field, an unknown one, a closed list and a hash shape are refused', () => {
    const { operator: _operator, ...without } = record();
    expect(validate(without)).toContain('$: operator is required');
    expect(validate({ ...record(), pass: true }).join(' ')).toContain('pass is not a field');
    expect(validate({ ...record(), evidence: 'probably hardware' })).not.toEqual([]);
    expect(validate({ ...record(), firmware: { image_sha256: 'nope' } }).join(' ')).toContain('image_sha256');
  });

  test('the firmware fields come from the real keys of zplc sys build --json, as the generated formatter printed them', () => {
    const build = JSON.parse(readFileSync(join(ROOT, 'tools/hil/testdata/identity-host-runtime.json'), 'utf8')) as Record<string, unknown>;
    const identity = parseBuildIdentity(build)!;
    expect(identity.commit).toMatch(/^[0-9a-f]{40}$/);
    const found = firmwareIdentity(identity);
    expect(found).toMatchObject({
      commit: build.commit, version: build.version, dirty: build.dirty, board_target: build.board,
      abi_major: build.abi_major, abi_minor: build.abi_minor, draft_counter: build.draft_counter,
      options_hash: build.options_hash, options: build.options, build_options: { build_type: 'Release' }, hil_trace: null,
    });
    expect(validate({ ...record(), firmware: found })).toEqual([]);
  });

  test('the text of zplc version is the same identity as the JSON', () => {
    const text = readFileSync(join(ROOT, 'tools/hil/testdata/identity-host-runtime.txt'), 'utf8');
    const json = JSON.parse(readFileSync(join(ROOT, 'tools/hil/testdata/identity-host-runtime.json'), 'utf8')) as Record<string, unknown>;
    expect(parseIdentityText(text)).toEqual(parseBuildIdentity(json));
    expect(parseIdentityText('ZPLC Runtime v1.5.0\nBuilt: Oct 10 2026 12:00:00\n')).toBeUndefined();
  });

  test('a Zephyr image says in its options whether it has the HIL trace, from the identity of the Pico built with and without the overlay', () => {
    const read = (name: string) => JSON.parse(readFileSync(join(ROOT, 'tools/hil/testdata', name), 'utf8')) as Record<string, unknown>;
    const release = parseBuildIdentity(read('identity-rpi-pico-release.json'))!;
    const traced = parseBuildIdentity(read('identity-rpi-pico-hil-trace.json'))!;
    expect(release.optionsHash).not.toBe(traced.optionsHash);
    expect(firmwareIdentity(release).hil_trace).toBe(false);
    expect(firmwareIdentity(traced).hil_trace).toBe(true);
    expect(firmwareIdentity(traced).board_target).toBe('rpi_pico/rp2040');
    expect(parseIdentityText(readFileSync(join(ROOT, 'tools/hil/testdata/identity-rpi-pico-hil-trace.txt'), 'utf8'))).toEqual(traced);
    const host = parseBuildIdentity(read('identity-host-runtime.json'))!;
    expect(firmwareIdentity(host).hil_trace).toBeNull();
    expect(firmwareIdentity({ ...host, commit: 'unknown' }).commit).toBeNull();
    expect(firmwareIdentity(undefined)).toEqual({});
    expect(parseBuildIdentity({ version: 'x' })).toBeUndefined();
  });

  test('a unit is named by a hash that hides its serial number', () => {
    const named = serialHash('2E8A', '000A', 'E6614103E7123456')!;
    expect(named).toMatch(/^[0-9a-f]{64}$/);
    expect(named).not.toContain('E6614103'.toLowerCase());
    expect(serialHash('2E8A', '000A', undefined)).toBeNull();
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('one failed step fails the run; steps that are pending do not', () => {
    expect(summarize({ steps: [{ id: 'a', title: 'a', kind: 'automatic', result: 'pass' }, { id: 'b', title: 'b', kind: 'automatic', result: 'fail' }], tests: [] })).toBe('fail');
    expect(summarize({ steps: [{ id: 'a', title: 'a', kind: 'automatic', result: 'pending' }], tests: [] })).toBe('incomplete');
    expect(summarize({ steps: [{ id: 'a', title: 'a', kind: 'automatic', result: 'pass' }, { id: 'b', title: 'b', kind: 'automatic', result: 'pending' }], tests: [] })).toBe('pass');
  });

  (python ? test : test.skip)('the Python tool reads the captured identity into the same firmware fields', () => {
    const sample = JSON.parse(readFileSync(join(ROOT, 'tools/hil/testdata/identity-host-runtime.json'), 'utf8')) as Record<string, unknown>;
    const done = spawnSync(python!, ['-B', '-c', 'import json, sys; sys.path.insert(0, "tools/hil"); import hil_record as r; print(json.dumps(r.firmware_identity(json.load(open("tools/hil/testdata/identity-host-runtime.json")))))'], { cwd: ROOT, encoding: 'utf8' });
    expect(done.status).toBe(0);
    expect(JSON.parse(done.stdout)).toEqual(JSON.parse(JSON.stringify(firmwareIdentity(parseBuildIdentity(sample)))));
  });

  (python ? test : test.skip)('a record this tool writes is one the Python tool accepts, and the other way round', () => {
    const directory = mkdtempSync(join(tmpdir(), 'zplc-hil-record-'));
    try {
      const written = join(directory, 'ts.json');
      writeFileSync(written, JSON.stringify(record()));
      const accepted = spawnSync(python!, ['-B', 'tools/hil/hil_record.py', written], { cwd: ROOT, encoding: 'utf8' });
      expect(accepted.stdout.trim()).toBe('valid');
      expect(accepted.status).toBe(0);

      const made = spawnSync(python!, ['-B', '-c', [
        'import json, sys; sys.path.insert(0, "tools/hil"); import hil_record as r',
        'v = r.new_record("chain", "host-runtime", {"id": "rpi_pico"}, "CI")',
        'v["device"] = {"reported_board": "native_posix", "link": "host-runtime"}',
        'v["steps"] = [{"id": "h", "title": "Handshake", "kind": "automatic", "result": "pass"}]',
        'v["result"] = r.summarize(v)',
        'print(json.dumps(v))',
      ].join('\n')], { cwd: ROOT, encoding: 'utf8' });
      expect(made.status).toBe(0);
      expect(validate(JSON.parse(made.stdout))).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
