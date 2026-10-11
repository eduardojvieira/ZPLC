import { describe, expect, test } from 'bun:test';
import { supportLevelFromRecords } from './supportLevel';

const record = (overrides: Record<string, unknown> = {}) => ({
  schema: 'zplc.hil-record/1',
  board_id: 'b',
  firmware_version: '2.0.0-rc.4',
  commit: '0123456789abcdef0123456789abcdef01234567',
  image_sha256: 'a'.repeat(64),
  result: 'pass',
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
    for (const bad of [record({ board_id: 'other' }), record({ commit: 'abc' }), record({ image_sha256: 'zz' }), record({ schema: 'x' }), null, 'text']) {
      expect(supportLevelFromRecords('b', [['records/x.json', bad]])).toEqual({ level: 'cross-build', records: [] });
    }
  });
});
