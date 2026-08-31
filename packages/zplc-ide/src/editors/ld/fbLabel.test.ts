import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitFBIdentifier } from './fbLabel';

describe('LD function-block labels', () => {
  it('preserves segment order in at most two bounded lines', () => {
    expect(splitFBIdentifier('COMM_PUBLISH')).toEqual(['COMM', 'PUBLISH']);
    expect(splitFBIdentifier('AWS_FLEET_PROVISION')).toEqual(['AWS_FLEET', 'PROVISION']);
    const lines = splitFBIdentifier('COMMUNICATION_PUBLISHER_LONG_NAME');
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.at(-1)).toEndWith('…');
  });

  it('keeps type, instance, and live-value rows in distinct fixed-box bands', () => {
    const source = readFileSync(join(import.meta.dir, 'LDElement.tsx'), 'utf8');
    expect(source).toContain('y={boxY + (typeLines.length > 1 ? 9 : 12)}');
    expect(source).toContain('fontSize={typeLines.length > 1 ? 7 : 10}');
    expect(source).toContain('y={boxY + 24 + index * 6}');
    expect(source).toContain('y1={boxY + 28}');
    expect(source).toContain('showsOutputValues ? 1 : 2');
  });
});
