import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LDElement as LDElementModel } from '../../models/ld';
import LDElement, { type DebugValuesMap } from './LDElement';

describe('LD function-block port names in debug', () => {
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
