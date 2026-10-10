import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createArchiveDialogs, type ArchiveDialogHost } from './projectArchiveDialogs';

const WINDOW = { isDestroyed: () => false, webContents: { id: 7 } };
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

function host(answers: { save?: string; open?: string; canceled?: boolean } = {}) {
  const shown: Array<{ kind: 'save' | 'open'; title: string; properties?: string[]; extensions?: string[] }> = [];
  const dialog: ArchiveDialogHost = {
    async showSaveDialog(window, options) { shown.push({ kind: 'save', title: options.title, extensions: options.filters?.[0]?.extensions }); expect(window).toBe(WINDOW); return { canceled: answers.canceled === true, filePath: answers.save }; },
    async showOpenDialog(window, options) { shown.push({ kind: 'open', title: options.title, properties: options.properties, extensions: options.filters?.[0]?.extensions }); expect(window).toBe(WINDOW); return { canceled: answers.canceled === true, filePaths: answers.open ? [answers.open] : [] }; },
  };
  return { dialog, shown };
}

describe('the archive dialogs (IDE-022)', () => {
  it('ask the user in the window of the owner, for an archive file or for a folder', async () => {
    const { dialog, shown } = host({ save: '/home/u/motor.zip', open: '/home/u/in.zip' });
    const dialogs = createArchiveDialogs({ dialog, getWindow: () => WINDOW, isPackaged: true, env: {} });
    expect(await dialogs.saveFile(7, 'motor.zplc.zip')).toBe('/home/u/motor.zip');
    expect(await dialogs.openFile(7)).toBe('/home/u/in.zip');
    expect(await dialogs.chooseFolder(7)).toBe('/home/u/in.zip');
    expect(shown.map(({ kind, properties }) => `${kind}:${properties?.join('+') ?? ''}`)).toEqual(['save:', 'open:openFile', 'open:openDirectory+createDirectory']);
    expect(shown[0]!.extensions).toEqual(['zip']);
  });

  it('answer null when the user cancels, and when the window is not the owner\'s', async () => {
    const dialogs = createArchiveDialogs({ dialog: host({ canceled: true }).dialog, getWindow: () => WINDOW, isPackaged: true, env: {} });
    expect(await dialogs.saveFile(7, 'x.zip')).toBeNull();
    expect(await dialogs.openFile(7)).toBeNull();
    expect(await dialogs.chooseFolder(7)).toBeNull();
    const nobody = createArchiveDialogs({ dialog: host().dialog, getWindow: () => null, isPackaged: true, env: {} });
    expect(await nobody.openFile(7)).toBeNull();
    const elsewhere = createArchiveDialogs({ dialog: host().dialog, getWindow: () => WINDOW, isPackaged: true, env: {} });
    expect(await elsewhere.openFile(8)).toBeNull();
    const gone = createArchiveDialogs({ dialog: host().dialog, getWindow: () => ({ ...WINDOW, isDestroyed: () => true }), isPackaged: true, env: {} });
    expect(await gone.openFile(7)).toBeNull();
  });

  it('are answered by the suite\'s answer file when the app is not packaged, and never when it is', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'zplc-dialogs-'));
    folders.push(folder);
    const answer = join(folder, 'answer.txt');
    writeFileSync(answer, '/tmp/from-the-file\n');
    const { dialog, shown } = host({ open: '/home/u/real.zip' });
    const env = { ZPLC_SMOKE_FOLDER_ANSWER_FILE: answer };
    const development = createArchiveDialogs({ dialog, getWindow: () => WINDOW, isPackaged: false, env });
    expect(await development.openFile(7)).toBe('/tmp/from-the-file');
    expect(shown).toEqual([]);
    writeFileSync(answer, '');
    expect(await development.openFile(7)).toBeNull(); // an empty answer is a cancel
    const packaged = createArchiveDialogs({ dialog, getWindow: () => WINDOW, isPackaged: true, env });
    expect(await packaged.openFile(7)).toBe('/home/u/real.zip');
  });
});
