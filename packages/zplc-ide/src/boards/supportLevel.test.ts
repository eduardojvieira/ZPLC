import { describe, expect, test } from 'bun:test';
import { supportLevelFromRecords } from './supportLevel';

const record = (overrides: Record<string, unknown> = {}) => ({
  schema: 'zplc.hil-record/1',
  board_id: 'b',
  firmware_version: '2.0.0-rc.4',
  commit: '0123456789abcdef0123456789abcdef01234567',
  image_sha256: 'a'.repeat(64),
  result: 'pass',
  evidence_level: 'hardware',
  ...overrides,
});

describe('support level derived from evidence records (IO-015)', () => {
  test('a board with no record is cross-build', () => {
    expect(supportLevelFromRecords('b', [])).toEqual({ level: 'cross-build', records: [] });
  });

  test('a passing record raises the level and names the firmware version it was made on', () => {
    const level = supportLevelFromRecords('b', [['records/b.json', record()]]);
    expect(level.level).toBe('human-hil');
    expect(level.records.map((entry) => entry.firmwareVersion)).toEqual(['2.0.0-rc.4']);
  });

  test('a failed record is listed but does not raise the level', () => {
    const level = supportLevelFromRecords('b', [['records/b.json', record({ result: 'fail' })]]);
    expect(level.level).toBe('cross-build');
    expect(level.records).toHaveLength(1);
  });

  test('a record for another board, without a commit or with a bad hash is ignored', () => {
    for (const bad of [
      record({ board_id: 'other' }),
      record({ commit: 'abc' }),
      record({ image_sha256: 'zz' }),
      record({ schema: 'x' }),
      null,
      'text',
    ]) {
      expect(supportLevelFromRecords('b', [['records/x.json', bad]])).toEqual({ level: 'cross-build', records: [] });
    }
  });

  test('a report from a user is a lead and never raises the level, whatever its result (HIL-011)', () => {
    for (const result of ['pass', 'fail']) {
      const report = record({
        schema: 'zplc.community-report/1',
        level: 'community-reported',
        result,
        issue: 'https://github.com/eduardojvieira/ZPLC/issues/1',
      });
      expect(supportLevelFromRecords('b', [['records/user.json', report]])).toEqual({ level: 'cross-build', records: [] });
    }
  });

  test('only a hardware record raises the level: an emulated one never does, whatever its result (HIL contract)', () => {
    const emulated = record({ evidence_level: 'emulated', emulator: { name: 'rp2040js', version: '1', patch_sha256: null } });
    expect(supportLevelFromRecords('b', [['records/e.json', emulated]])).toEqual({ level: 'cross-build', records: [] });
    for (const level of [null, 'community-reported', 'Hardware']) {
      expect(supportLevelFromRecords('b', [['records/e.json', record({ evidence_level: level })]]).level).toBe('cross-build');
    }
    const older = Object.fromEntries(Object.entries(record()).filter(([key]) => key !== 'evidence_level'));
    expect(supportLevelFromRecords('b', [['records/e.json', { ...older, evidence: 'emulated' }]]).level).toBe('cross-build');
    expect(supportLevelFromRecords('b', [['records/h.json', { ...older, evidence: 'hardware' }]]).level).toBe('human-hil');
    // HIL-009: a record that names no level is not taken for a hardware one
    expect(supportLevelFromRecords('b', [['records/n.json', older]]).level).toBe('cross-build');
  });
});
