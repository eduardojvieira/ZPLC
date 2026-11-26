/** AIX-013, UX-029: a visual file that does not open names the place and the accepted values in the language of the interface. */
import { afterAll, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const realCodeEditor = { ...(await import('./CodeEditor')) };
await mock.module('./CodeEditor', () => ({
  ...realCodeEditor,
  CodeEditor: ({ fileId }: { fileId: string }) => <div data-code-editor={fileId} />,
}));
afterAll(async () => {
  await mock.module('./CodeEditor', () => realCodeEditor);
});
const { useIDEStore } = await import('../store/useIDEStore');
const { useReviewDocument } = await import('../store/useReviewDocument');
const { useConfigEditors } = await import('../store/useConfigEditors');
const { useEditorGroups } = await import('../store/useEditorGroups');
const { ONE_GROUP } = await import('../layout/editorGroups');
const { resetCommandsForTest } = await import('../commands/bus');
const { LD_ELEMENT_TYPES } = await import('../models/visualFileLoad');
const { EditorArea } = await import('./EditorArea');

const ladder = {
  name: 'Main',
  variables: { local: [], outputs: [] },
  rungs: [{ id: 'rung_1', number: 1, elements: [{ id: 'e1', type: 'contact', variable: 'Start' }] }],
};

describe('AIX-013 the open error of a visual file, in Spanish', () => {
  it('names the place, the value found and the accepted values with the Spanish words of the catalogue', () => {
    resetCommandsForTest();
    const file = {
      id: 'file:src/Main.ld.json',
      name: 'Main.ld.json',
      path: 'src/Main.ld.json',
      parentPath: 'src',
      language: 'LD' as const,
      content: JSON.stringify(ladder),
      isModified: false,
    };
    dom.patchStore(useIDEStore, {
      loadedFiles: new Map([[file.id, file]]),
      openTabs: [file.id],
      activeFileId: file.id,
      showSettings: false,
      projectSession: 1,
    } as never);
    dom.patchStore(useEditorGroups, { groups: ONE_GROUP, activeFirst: null, pendingFor: -1 } as never);
    dom.patchStore(useReviewDocument, { open: false, active: false } as never);
    dom.patchStore(useConfigEditors, { open: [], active: null } as never);

    dom.render(<EditorArea />, { locale: 'es' });
    const es = dom.tFor('es');
    const shown = document.querySelector('[data-file-error]')!.textContent!;
    const expected = es('workbench.editor.violation.invalidValue', {
      path: 'rungs[0].elements[0].type',
      found: 'contact',
      values: LD_ELEMENT_TYPES.join(', '),
    });
    expect(expected).toContain('valores aceptados');
    expect(shown).toContain(expected);
    expect(shown).not.toContain('Invalid option');
  });
});
