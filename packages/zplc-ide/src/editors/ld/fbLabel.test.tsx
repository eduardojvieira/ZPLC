import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LDElement as LDElementModel } from '../../models/ld';
import LDElement, { type DebugValuesMap } from './LDElement';
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
    // The instance name is set at 9px, as large as ten monospace characters fit in the 70px box (6px was unreadable).
    expect(source).toContain('y={boxY + 24 + index * 9}');
    expect(source).toContain('fontSize={9}');
    expect(source).toContain('y1={boxY + 28}');
    expect(source).toContain('showsOutputValues ? 1 : 2');
  });

  it('UX-006 draws the port names of a function block in debug at 9px, never smaller than the instance name', () => {
    const element = { id: 'f1', type: 'function_block', fbType: 'TON', instance: 'OffTimer', row: 0, col: 0 } as LDElementModel;
    const sample = { value: true, type: 'BOOL', address: 0, region: null, size: 1, loading: false, exists: true, error: null };
    const debugValues = new Map([['OffTimer.Q', sample]]) as DebugValuesMap;
    const markup = renderToStaticMarkup(
      <svg>
        <LDElement element={element} x={0} y={0} debugValues={debugValues} />
      </svg>,
    );
    const sizeOf = (label: string) => Number(new RegExp(`font-size="([\\d.]+)"[^>]*>${label}</text>`).exec(markup)?.[1]);
    expect(sizeOf('OffTimer')).toBe(9);
    expect(sizeOf('Q')).toBeGreaterThanOrEqual(9);
    expect(sizeOf('ET')).toBeGreaterThanOrEqual(9);
  });
});
