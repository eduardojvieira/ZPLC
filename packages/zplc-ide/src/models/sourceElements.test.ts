import { afterEach, describe, expect, it, mock } from 'bun:test';

import { projectLoaderStub } from '../test/projectLoaderStub';

// The settings store reaches the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { useAppSettings } = await import('../store/useAppSettings');
const { describeElement, describeElementInUi } = await import('./sourceElements');

const setLanguage = (language: 'auto' | 'en' | 'es') => useAppSettings.getState().update({ language });
afterEach(() => setLanguage('auto'));

describe('the place of a diagram element', () => {
  it('reads in the interface language, and stays English for the CLI, MCP and logs', () => {
    setLanguage('es');
    expect(describeElementInUi("rung:rung_1/cell:0,3")).toBe("Peldaño LD 'rung_1', celda 0,3");
    expect(describeElementInUi('step:s1')).toBe("Paso SFC 's1'");
    expect(describeElement('rung:rung_1/cell:0,3')).toBe("LD rung 'rung_1', cell 0,3");
    setLanguage('en');
    expect(describeElementInUi('rung:rung_1/cell:0,3')).toBe("LD rung 'rung_1', cell 0,3");
  });
});
