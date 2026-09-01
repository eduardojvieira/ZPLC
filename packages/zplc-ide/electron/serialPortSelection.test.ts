import { describe, expect, it, mock } from 'bun:test';
import { selectSerialPort } from './serialPortSelection';

const ports = [
  { portId: 'private-port-1', displayName: 'PLC USB' },
  { portId: 'private-port-2', portName: 'COM12' },
] as const;

function dialog(response: number): { showMessageBox: ReturnType<typeof mock> } {
  return { showMessageBox: mock(async () => ({ response })) };
}

describe('selectSerialPort', () => {
  it('returns only the human-selected port id and never displays it', async () => {
    const callback = mock(() => undefined);
    const nativeDialog = dialog(2);

    await selectSerialPort({ ports, dialog: nativeDialog, isCurrent: () => true, isPortStale: () => false, callback });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('private-port-2');
    expect(nativeDialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      buttons: ['Cancel', 'PLC USB', 'COM12'], cancelId: 0, defaultId: 0,
    }));
    expect(JSON.stringify(nativeDialog.showMessageBox.mock.calls)).not.toContain('private-port');
  });

  it('bounds and sanitizes human labels', async () => {
    const callback = mock(() => undefined);
    const nativeDialog = dialog(1);
    const displayName = `PLC\u0000\u202E\u200B ${'x'.repeat(120)}`;
    await selectSerialPort({
      ports: [{ portId: 'private-port', displayName }],
      dialog: nativeDialog,
      isCurrent: () => true,
      isPortStale: () => false,
      callback,
    });
    const buttons = nativeDialog.showMessageBox.mock.calls[0]?.[0]?.buttons as string[];
    expect(buttons[1]).toHaveLength(96);
    expect(buttons[1]).not.toContain('\u0000');
    expect(buttons[1]).not.toContain('\u202E');
    expect(buttons[1]).not.toContain('\u200B');
  });

  it.each([
    ['cancel', 0, () => true, () => false],
    ['invalid button index', 9, () => true, () => false],
    ['stale selected port', 1, () => true, (portId: string) => portId === 'private-port-1'],
  ])('cancels %s', async (_name, response, isCurrent, isPortStale) => {
    const callback = mock(() => undefined);
    await selectSerialPort({ ports, dialog: dialog(response), isCurrent, isPortStale, callback });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('');
  });

  it('cancels before showing a dialog for an empty list or stale owner', async () => {
    const callback = mock(() => undefined);
    const nativeDialog = dialog(1);
    await selectSerialPort({ ports: [], dialog: nativeDialog, isCurrent: () => true, isPortStale: () => false, callback });
    await selectSerialPort({ ports, dialog: nativeDialog, isCurrent: () => false, isPortStale: () => false, callback });
    expect(nativeDialog.showMessageBox).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, '');
    expect(callback).toHaveBeenNthCalledWith(2, '');
  });

  it('cancels exactly once when the dialog errors or owner changes while awaiting it', async () => {
    const callback = mock(() => undefined);
    const failingDialog = { showMessageBox: mock(async () => { throw new Error('dialog failed'); }) };
    await selectSerialPort({ ports, dialog: failingDialog, isCurrent: () => true, isPortStale: () => false, callback });

    let current = true;
    let resolveDialog: ((value: { response: number }) => void) | undefined;
    const pendingDialog = { showMessageBox: mock(() => new Promise<{ response: number }>((resolve) => { resolveDialog = resolve; })) };
    const pending = selectSerialPort({ ports, dialog: pendingDialog, isCurrent: () => current, isPortStale: () => false, callback });
    current = false;
    resolveDialog?.({ response: 1 });
    await pending;

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, '');
    expect(callback).toHaveBeenNthCalledWith(2, '');
  });
});
