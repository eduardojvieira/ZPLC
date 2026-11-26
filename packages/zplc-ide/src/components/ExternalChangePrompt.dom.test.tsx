import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { ExternalChangePrompt } = await import('./ExternalChangePrompt');
const { useExternalConflicts } = await import('../store/externalChangeWatch');
const { useIDEStore } = await import('../store/useIDEStore');

const ID = 'file:src/Drive.st';
function openDrive(content: string, extra: Record<string, unknown> = {}) {
  const disk = { text: content, writes: [] as string[] };
  const handle = {
    getFile: async () => ({ text: async () => disk.text }),
    createWritable: async () => ({
      write: async (text: string) => {
        disk.text = text;
        disk.writes.push(text);
      },
      close: async () => undefined,
    }),
  } as unknown as FileSystemFileHandle;
  useIDEStore.setState({
    loadedFiles: new Map([
      [ID, { id: ID, name: 'Drive.st', language: 'ST', path: 'src/Drive.st', content, isModified: false, diskContent: content, handle, ...extra }],
    ]) as never,
  });
  return disk;
}

afterEach(() => {
  useExternalConflicts.setState({ conflicts: [], notices: [], review: null });
  useIDEStore.setState({ loadedFiles: new Map() });
});

describe('the notice of a file replaced from outside (AIX-012, bar criterion AI-4)', () => {
  it('names the file, shows what changed in the conflict prompt, and restores what Studio had', async () => {
    const disk = openDrive('x := 2;');
    useExternalConflicts.setState({
      notices: [{ path: 'src/Drive.st', name: 'Drive.st', kind: 'file', before: 'x := 1;', after: 'x := 2;' }],
    });
    const { user } = dom.render(<ExternalChangePrompt />);

    const region = dom.screen.getByRole('region', { name: dom.t('studio.notice.externalRegion') });
    expect(dom.within(region).getByText(dom.t('studio.notice.externalUpdated', { name: 'Drive.st' }))).toBeTruthy();

    await user.click(dom.screen.getByRole('button', { name: dom.t('studio.notice.whatChangedLabel', { name: 'Drive.st' }) }));
    const dialog = dom.screen.getByRole('dialog');
    const lines = [...dialog.querySelectorAll('[data-diff-line]')].map((line) => [line.getAttribute('data-diff-line'), line.textContent]);
    expect(lines).toEqual([
      ['removed', '- x := 1;'],
      ['added', '+ x := 2;'],
    ]);

    await user.click(dom.within(dialog).getByRole('button', { name: dom.t('studio.notice.restoreLabel', { name: 'Drive.st' }) }));
    await dom.waitFor(() => expect(disk.writes).toEqual(['x := 1;']));
    const file = useIDEStore.getState().loadedFiles.get(ID);
    expect(file?.content).toBe('x := 1;');
    expect(file?.isModified).toBe(false);
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    expect(dom.screen.queryByText(dom.t('studio.notice.externalUpdated', { name: 'Drive.st' }))).toBeNull();
  });

  it('restores from the notice itself, with the keyboard', async () => {
    const disk = openDrive('x := 2;');
    useExternalConflicts.setState({
      notices: [{ path: 'src/Drive.st', name: 'Drive.st', kind: 'file', before: 'x := 1;', after: 'x := 2;' }],
    });
    const { user } = dom.render(<ExternalChangePrompt />);
    const restore = dom.screen.getByRole('button', { name: dom.t('studio.notice.restoreLabel', { name: 'Drive.st' }) });
    restore.focus();
    await user.keyboard('{Enter}');
    await dom.waitFor(() => expect(disk.writes).toEqual(['x := 1;']));
    expect(useIDEStore.getState().loadedFiles.get(ID)?.content).toBe('x := 1;');
  });

  it('a plant or project notice names the file and offers neither, since Studio has nothing to show', () => {
    useExternalConflicts.setState({ notices: [{ path: 'scene.json', name: 'scene.json', kind: 'plant' }] });
    dom.render(<ExternalChangePrompt />);
    expect(dom.screen.getByText(dom.t('studio.notice.externalPlant', { name: 'scene.json' }))).toBeTruthy();
    expect(dom.screen.queryByRole('button', { name: dom.t('studio.notice.whatChangedLabel', { name: 'scene.json' }) })).toBeNull();
  });

  it('the prompt of a file with unsaved changes compares the version of the person with the one on disk', async () => {
    openDrive('x := 9;', { isModified: true, diskContent: 'x := 1;' });
    useExternalConflicts.setState({ conflicts: [{ path: 'src/Drive.st', name: 'Drive.st', disk: 'x := 2;' }] });
    const { user } = dom.render(<ExternalChangePrompt />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('studio.notice.compareLabel', { name: 'Drive.st' }) }));
    const lines = [...dom.screen.getByRole('dialog').querySelectorAll('[data-diff-line]')].map((line) => line.textContent);
    expect(lines).toEqual(['- x := 9;', '+ x := 2;']);
    // Comparing decides nothing: the buffer stays as the person left it.
    expect(useIDEStore.getState().loadedFiles.get(ID)?.content).toBe('x := 9;');
  });
});
