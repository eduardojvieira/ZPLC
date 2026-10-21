import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

// VF-007: the two export items of the project menu, driven through user events. The export bridge of the desktop app is a fake
// that answers like the main process; the download of the JSON document is read from the Blob the item hands to the browser.
const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { chooseProjectFolder } = await import('../ipc/projectFilesHandles');
const { ProjectExportItems } = await import('./ProjectExportItems');

const FILE = { id: 'f1', name: 'main.st', path: 'src/main.st', language: 'ST' as const, content: 'PROGRAM Main\nEND_PROGRAM\n', isModified: false, parentPath: 'src' };
const TREE = { id: 'root', name: 'plant', type: 'directory' as const, path: '', isExpanded: true, children: [{ id: 'src', name: 'src', type: 'directory' as const, path: 'src', isExpanded: true, children: [{ id: 'f1', name: 'main.st', type: 'file' as const, path: 'src/main.st', language: 'ST' as const }] }] };
const CONFIG = { name: 'plant', version: '1.0.0' };

function openProject(over: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, { isProjectOpen: true, projectName: 'plant', projectConfig: CONFIG, fileTree: TREE, loadedFiles: new Map([['f1', { ...FILE }]]), consoleEntries: [], directoryHandle: null, ...over } as never);
}
const entries = () => useIDEStore.getState().consoleEntries;
const restores: Array<() => void> = [];
afterEach(() => { while (restores.length > 0) restores.pop()!(); });

/** A bridge that answers `exportArchive` as given and records its requests. */
function desktop(answer: unknown): { requests: unknown[] } {
  const requests: unknown[] = [];
  const bridge = { chooseFolder: async () => ({ ok: true, value: { rootId: 'r1', name: 'plant' } }), exportArchive: async (request: unknown) => { requests.push(request); return answer; } };
  (window as unknown as { electronAPI?: unknown }).electronAPI = { projectFiles: bridge };
  restores.push(() => { delete (window as unknown as { electronAPI?: unknown }).electronAPI; });
  return { requests };
}
async function openFolder() {
  const handle = await chooseProjectFolder((window as unknown as { electronAPI: { projectFiles: never } }).electronAPI.projectFiles);
  openProject({ directoryHandle: handle });
}

describe('Project export items in a DOM (VF-007, IDE-022)', () => {
  it('are two menu items with their own accessible names, so a menu can list them', () => {
    openProject();
    dom.render(<div role="menu"><ProjectExportItems /></div>);
    expect(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }).textContent).toContain(dom.t('workbench.export.archive'));
    expect(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.projectLabel') }).textContent).toContain(dom.t('workbench.export.project'));
  });

  it('Export project downloads the document with the files, and the Output panel gets one success line', async () => {
    openProject();
    const blobs: Blob[] = [];
    const anchors: string[] = [];
    const urls = URL as unknown as { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: () => void };
    const before = { create: urls.createObjectURL, revoke: urls.revokeObjectURL };
    urls.createObjectURL = (blob) => { blobs.push(blob); return 'blob:export'; };
    urls.revokeObjectURL = () => undefined;
    restores.push(() => { urls.createObjectURL = before.create; urls.revokeObjectURL = before.revoke; });
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { anchors.push(this.download); });
    restores.push(() => click.mockRestore());
    const { user } = dom.render(<div role="menu"><ProjectExportItems /></div>);
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.projectLabel') }));
    await dom.waitFor(() => expect(anchors).toEqual(['plant.zplc.json']));
    const exported = JSON.parse(await blobs[0]!.text()) as { files: Array<{ path: string; content: string }>; config: { name: string }; redactedPaths: string[] };
    expect(exported.files).toEqual([{ name: 'main.st', path: 'src/main.st', language: 'ST', content: FILE.content }]);
    expect(exported.config.name).toBe('plant');
    expect(Array.isArray(exported.redactedPaths)).toBe(true);
    expect(entries().map((entry) => entry.type)).toEqual(['success']);
    expect(document.body.querySelector('a[download]')).toBeNull();
  });

  it('Export project with no project open downloads nothing and reports an error', async () => {
    openProject({ isProjectOpen: false, projectConfig: null, fileTree: null });
    let downloads = 0;
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { downloads += 1; });
    restores.push(() => click.mockRestore());
    const { user } = dom.render(<div role="menu"><ProjectExportItems /></div>);
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.projectLabel') }));
    await dom.waitFor(() => expect(entries().map((entry) => entry.type)).toEqual(['error']));
    expect(downloads).toBe(0);
  });

  it('Export project archive asks the desktop app for the folder of the project and reports the file it wrote', async () => {
    const { requests } = desktop({ ok: true, value: { fileName: 'plant.zip', fileCount: 3, folderCount: 1, bytes: 2048, skipped: 0 } });
    await openFolder();
    const { user } = dom.render(<div role="menu"><ProjectExportItems /></div>);
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }));
    await dom.waitFor(() => expect(entries()).toHaveLength(1));
    expect(requests).toEqual([{ rootId: 'r1' }]);
    expect(entries()[0]!.type).toBe('success');
    expect(entries()[0]!.message).toContain('plant.zip');
  });

  it('the archive waits for unsaved changes: a warning, and the desktop app is not asked', async () => {
    const { requests } = desktop({ ok: true, value: { fileName: 'plant.zip', fileCount: 1, folderCount: 1, bytes: 1, skipped: 0 } });
    await openFolder();
    openProject({ directoryHandle: useIDEStore.getState().directoryHandle, loadedFiles: new Map([['f1', { ...FILE, isModified: true }]]) });
    const { user } = dom.render(<div role="menu"><ProjectExportItems /></div>);
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }));
    await dom.waitFor(() => expect(entries().map((entry) => entry.type)).toEqual(['warning']));
    expect(requests).toEqual([]);
  });

  it('a refusal of the desktop app is an error line, a closed dialog is silent, and a browser build says it needs the desktop app', async () => {
    desktop({ ok: false, code: 'denied' });
    await openFolder();
    const { user } = dom.render(<div role="menu"><ProjectExportItems /></div>);
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }));
    await dom.waitFor(() => expect(entries().map((entry) => entry.type)).toEqual(['error']));
    restores.pop()!();

    desktop({ ok: true, value: null });
    await openFolder();
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }));
    await dom.settle();
    expect(entries()).toHaveLength(0);
    restores.pop()!();

    openProject();
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('workbench.export.archiveLabel') }));
    await dom.waitFor(() => expect(entries().map((entry) => entry.type)).toEqual(['error']));
  });
});
