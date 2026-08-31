import { describe, expect, it } from 'bun:test';
import { displayEditorFileName } from './editorFilePresentation';

describe('editor file presentation', () => {
  it('hides the JSON storage suffix only for visual editor tabs', () => {
    expect(displayEditorFileName('main.fbd.json', 'FBD')).toBe('main.fbd');
    expect(displayEditorFileName('main.ld.json', 'LD')).toBe('main.ld');
    expect(displayEditorFileName('main.sfc.json', 'SFC')).toBe('main.sfc');
    expect(displayEditorFileName('main.st', 'ST')).toBe('main.st');
  });
});
