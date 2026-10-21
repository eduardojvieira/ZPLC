import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactSource } from '../i18n/inlineMessages';

const source = (...parts: string[]) => compactSource(readFileSync(join(import.meta.dir, '..', ...parts), 'utf8'));
const editor = source('components', 'CodeEditor.tsx');
// the app starts the saving; the workbench shell, which App renders, holds the split
const app = source('App.tsx') + source('shell', 'WorkbenchShell.tsx');

describe('the editor reports and applies the session (IDE-008)', () => {
  it('reports the cursor and the scroll of the file behind the shown model, not of whichever file the component was last given', () => {
    expect(editor).toContain("import { projectPathFromModelPath } from '../utils/sessionState';");
    expect(editor).toContain("import { recordViewState, takePendingViewState } from '../store/sessionPersistence';");
    expect(editor).toContain('editor.onDidChangeCursorPosition(() => reportViewState(editor));');
    expect(editor).toContain('editor.onDidScrollChange((change) => { if (change.scrollTopChanged) reportViewState(editor); });');
    expect(editor).toContain('projectPathFromModelPath(model.uri.path)');
    expect(editor).toContain(
      'recordViewState(path, { line: position.lineNumber, column: position.column, scrollTop: editor.getScrollTop() })',
    );
  });

  it('puts a restored cursor and scroll back once, when the editor first shows the file, within what the file holds', () => {
    expect(editor).toContain('takePendingViewState(filePath)');
    expect(editor).toContain('projectPathFromModelPath(model.uri.path) !== filePath');
    expect(editor).toContain('Math.min(view.line, model.getLineCount())');
    expect(editor).toContain('editor.setPosition({ lineNumber, column })');
    expect(editor).toContain('editor.setScrollTop(view.scrollTop)');
    // The check of the shown model comes before the position is taken, so a model that is not the file's yet loses nothing.
    expect(editor.indexOf('projectPathFromModelPath(model.uri.path) !== filePath')).toBeLessThan(
      editor.indexOf('takePendingViewState(filePath)'),
    );
  });
});

describe('the workbench keeps its split per project (IDE-008)', () => {
  it('starts the layout from the split the project was left in, and applies it when another project opens', () => {
    expect(app).toContain('defaultLayout={sessionLayout ?? defaultLayout}');
    expect(app).toContain('groupRef={setGroupPanel}');
    expect(app).toContain('groupPanel.setLayout(layout)');
  });

  it('records only a split that the user made, and starts and stops the saving with the app', () => {
    expect(app).toContain('if (meta.isUserInteraction) {');
    expect(app).toContain('workspaceLayoutFrom(layout)');
    expect(app).toContain('startSessionPersistence(useIDEStore)');
    expect(app).toContain("import { startSessionPersistence } from './store/sessionPersistence';");
  });
});
