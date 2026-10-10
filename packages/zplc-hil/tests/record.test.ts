import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { firmwareIdentity, serialHash, sha256, summarize, validate } from '../src/record';
import type { RunRecord } from '../src/record';

const ROOT = new URL('../../../', import.meta.url).pathname;
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

  test('the commit comes from the build information when the image has it, and is null when it does not', () => {
    expect(firmwareIdentity({ zplc_version: '2.0.0', draft_counter: 4, build: { commit: 'b'.repeat(40), options: { HIL_DEBUG: false } } }))
      .toMatchObject({ commit: 'b'.repeat(40), version: '2.0.0', draft_counter: 4, build_options: { HIL_DEBUG: false } });
    expect(firmwareIdentity({ zplc_version: '2.0.0' })).toMatchObject({ commit: null, build_options: null });
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
