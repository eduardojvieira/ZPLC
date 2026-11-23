import { describe, expect, it } from 'bun:test';
import { stubProjectLoader } from '../test/dom';

await stubProjectLoader();
const { useIDEStore } = await import('./useIDEStore');
const { entriesForLevel } = await import('./consoleEntries');

describe('the lines the project actions write (MSG-005)', () => {
  it('MSG-005 closing a project writes one line that the normal level of Output shows', () => {
    useIDEStore.setState({ consoleEntries: [] });
    useIDEStore.getState().closeProject();
    const shown = entriesForLevel(useIDEStore.getState().consoleEntries, 'normal');
    expect(shown.map((entry) => entry.message)).toEqual(['Project closed']);
    expect(shown[0]?.step).toBe(true);
  });
});
