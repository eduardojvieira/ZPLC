import { beforeEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';

await setupDom();
await (await import('../test/dom')).stubProjectLoader();
const { useSelection } = await import('./useSelection');

beforeEach(() => useSelection.getState().clear());

describe('selection store (SHL-009)', () => {
  it('SHL-009 the selection store holds one element and one test and clears both', () => {
    expect(useSelection.getState().element).toBeNull();
    expect(useSelection.getState().test).toBeNull();
    useSelection.getState().setElement({ file: 'a.ld', element: 'rung-1', names: ['Start'] });
    useSelection.getState().setTest('tests/first.scenario.json');
    expect(useSelection.getState().element).toEqual({ file: 'a.ld', element: 'rung-1', names: ['Start'] });
    expect(useSelection.getState().test).toBe('tests/first.scenario.json');
    useSelection.getState().setElement({ file: 'b.fbd', element: 'n2', names: [] });
    expect(useSelection.getState().element?.file).toBe('b.fbd');
    useSelection.getState().setElement(null);
    expect(useSelection.getState().element).toBeNull();
    expect(useSelection.getState().test).toBe('tests/first.scenario.json');
    useSelection.getState().clear();
    expect(useSelection.getState().test).toBeNull();
  });
});
