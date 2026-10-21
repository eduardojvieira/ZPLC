import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { setupDom } from '../test/dom';

// VF-007: the terminal tab, driven through user events over a fake link. The connection manager is the real object with its
// serial operations replaced: no port is opened, and what the terminal sends is read back from the replaced `sendRaw`.
const dom = await setupDom();
const { connectionManager } = await import('../runtime/connectionManager');
const { TerminalTab } = await import('./TerminalTab');

const link = { connected: false, passthrough: false, rx: '', sent: [] as string[], polls: 0 };
const notify = (connected: boolean) => (connectionManager as unknown as { notifyConnectionChange(connected: boolean): void }).notifyConnectionChange(connected);
const restores: Array<() => void> = [];

function fakeLink(): void {
  Object.assign(link, { connected: false, passthrough: false, rx: '', sent: [], polls: 0 });
  Object.defineProperty(connectionManager, 'connected', { get: () => link.connected, configurable: true });
  Object.defineProperty(connectionManager, 'passthroughMode', { get: () => link.passthrough, configurable: true });
  Object.defineProperty(navigator, 'serial', { value: {}, configurable: true });
  const connect = spyOn(connectionManager, 'connect').mockImplementation(async () => { link.connected = true; notify(true); });
  const disconnect = spyOn(connectionManager, 'disconnect').mockImplementation(async () => { link.connected = false; notify(false); });
  const sendRaw = spyOn(connectionManager, 'sendRaw').mockImplementation(async (data: string) => { link.sent.push(data); });
  const enable = spyOn(connectionManager, 'enablePassthrough').mockImplementation(() => { link.passthrough = true; });
  const disable = spyOn(connectionManager, 'disablePassthrough').mockImplementation(() => { link.passthrough = false; });
  const rx = spyOn(connectionManager, 'getRxBuffer').mockImplementation(() => { link.polls += 1; return link.rx; });
  const clear = spyOn(connectionManager, 'clearRxBuffer').mockImplementation(() => { link.rx = ''; });
  restores.push(() => {
    for (const spy of [connect, disconnect, sendRaw, enable, disable, rx, clear]) spy.mockRestore();
    delete (connectionManager as unknown as Record<string, unknown>).connected;
    delete (connectionManager as unknown as Record<string, unknown>).passthroughMode;
    delete (navigator as unknown as Record<string, unknown>).serial;
  });
}
afterEach(() => { while (restores.length > 0) restores.pop()!(); });

async function connected(user: ReturnType<typeof dom.render>['user']) {
  await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.terminal.connect') }));
  await dom.waitFor(() => expect(dom.screen.getByText(dom.t('workbench.terminal.connected'))).toBeTruthy());
}
const output = (): string => document.body.textContent ?? '';

describe('Terminal tab in a DOM (VF-007)', () => {
  it('starts disconnected: the status says so, the command box is disabled and tells how to enable it', () => {
    fakeLink();
    dom.render(<TerminalTab isActive />);
    expect(dom.screen.getByText(dom.t('workbench.terminal.notConnected'))).toBeTruthy();
    const box = dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.placeholder).toBe(dom.t('workbench.terminal.connectToSend'));
    expect(output()).toContain(dom.t('terminal.welcome'));
    expect(dom.screen.getByRole('button', { name: dom.t('workbench.terminal.clear') })).toBeTruthy();
  });

  it('Connect opens the link and enables the command box, which takes the focus; Disconnect closes it and says so', async () => {
    fakeLink();
    const { user } = dom.render(<TerminalTab isActive />);
    await connected(user);
    const box = dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }) as HTMLInputElement;
    expect(box.disabled).toBe(false);
    expect(box.placeholder).toBe(dom.t('workbench.terminal.typeCommand'));
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.terminal.disconnect') }));
    await dom.waitFor(() => expect(dom.screen.getByText(dom.t('workbench.terminal.notConnected'))).toBeTruthy());
    expect(output()).toContain(dom.t('terminal.disconnected'));
  });

  it('Enter sends the command with a line ending and echoes it; the passthrough badge shows while the tab is active', async () => {
    fakeLink();
    const { user } = dom.render(<TerminalTab isActive />);
    await connected(user);
    expect(dom.screen.getByText(dom.t('workbench.terminal.passthrough'))).toBeTruthy();
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }), 'zplc status{Enter}');
    await dom.waitFor(() => expect(link.sent).toEqual(['zplc status\r\n']));
    await dom.waitFor(() => expect(output()).toContain('$ zplc status'));
    expect((dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }) as HTMLInputElement).value).toBe('');
  });

  it('a command that sets or clears a force is refused with the reason and nothing is sent', async () => {
    fakeLink();
    const { user } = dom.render(<TerminalTab isActive />);
    await connected(user);
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }), 'zplc dbg force set 0 1{Enter}');
    await dom.waitFor(() => expect(output()).toContain(dom.t('terminal.forceBlocked')));
    expect(link.sent).toEqual([]);
  });

  it('the arrow keys walk the history of commands and Down past the newest empties the box', async () => {
    fakeLink();
    const { user } = dom.render(<TerminalTab isActive />);
    await connected(user);
    const box = dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }) as HTMLInputElement;
    await user.type(box, 'zplc status{Enter}');
    await user.type(box, 'zplc dbg info{Enter}');
    await user.keyboard('{ArrowUp}');
    expect(box.value).toBe('zplc dbg info');
    await user.keyboard('{ArrowUp}');
    expect(box.value).toBe('zplc status');
    await user.keyboard('{ArrowDown}');
    expect(box.value).toBe('zplc dbg info');
    await user.keyboard('{ArrowDown}');
    expect(box.value).toBe('');
  });

  it('what the device sends appears without its colour codes, and the clear command and the Clear button empty the output', async () => {
    fakeLink();
    const { user } = dom.render(<TerminalTab isActive />);
    await connected(user);
    await dom.act(async () => { link.rx = '\u001b[32mstate: RUN\u001b[0m\r\n'; await new Promise((resolve) => setTimeout(resolve, 60)); });
    await dom.waitFor(() => expect(output()).toContain('state: RUN'));
    expect(output()).not.toContain('[32m');
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('workbench.terminal.command') }), 'clear{Enter}');
    await dom.waitFor(() => expect(output()).not.toContain('state: RUN'));
    expect(link.sent).toEqual([]);
    await dom.act(async () => { link.rx = 'again\r\n'; await new Promise((resolve) => setTimeout(resolve, 60)); });
    await dom.waitFor(() => expect(output()).toContain('again'));
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.terminal.clear') }));
    expect(output()).not.toContain('again');
    expect(output()).toContain(dom.t('terminal.welcome'));
  });

  it('stops reading the link when the tab is removed, so a later reader gets what the device sends', async () => {
    fakeLink();
    const { user, unmount } = dom.render(<TerminalTab isActive />);
    await connected(user);
    await dom.waitFor(() => expect(link.polls).toBeGreaterThan(0));
    unmount();
    await dom.act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const polls = link.polls;
    link.rx = 'kept for the next reader';
    await dom.act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); });
    expect(link.polls).toBe(polls);
    expect(link.rx).toBe('kept for the next reader');
  });
});
