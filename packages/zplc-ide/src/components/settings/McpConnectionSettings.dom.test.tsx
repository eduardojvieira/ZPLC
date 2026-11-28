import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

// AIX-007, AI-11: choose a client, see the exact text, confirm, see the result, run the self-check; every step by keyboard.
const dom = await setupDom();
await stubProjectLoader();
const { McpConnectionSettings } = await import('./McpConnectionSettings');

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

const preview = (client: string) => ({
  ok: true,
  path: `/proj/${client}.json`,
  exists: client === 'cursor',
  text: `{\n  "client": "${client}"\n}\n`,
  copy: `copy-of-${client}`,
});

function bridge(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    mcpConnection: {
      preview: async (client: string) => {
        calls.push(`preview:${client}`);
        return preview(client);
      },
      write: async (request: { client: string; expected: string }) => {
        calls.push(`write:${request.client}:${request.expected.length}`);
        return { ok: true, path: `/proj/${request.client}.json`, backup: null };
      },
      selfCheck: async () => {
        calls.push('selfCheck');
        return { ok: true, ready: true, report: { folder: '/proj', toolCount: 12, problems: [] } };
      },
      ...overrides,
    },
  };
  return { calls };
}

/** A keyboard press: focus the control (what Tab does) and press Enter. */
async function key(view: ReturnType<typeof dom.render>, element: HTMLElement, press = '{Enter}') {
  element.focus();
  expect(document.activeElement).toBe(element);
  await view.user.keyboard(press);
}

describe('the MCP connection panel (AIX-007)', () => {
  it('chooses a client, shows the exact file and text, writes only after a confirmation, and says it was written', async () => {
    const { calls } = bridge();
    const view = dom.render(<McpConnectionSettings />);
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.file', { path: '/proj/claude-code.json' }))).toBeTruthy());
    await key(view, view.getByRole('button', { name: dom.t('mcp.client.cursor') }));
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.file', { path: '/proj/cursor.json' }))).toBeTruthy());
    const shown = view.getByLabelText(dom.t('mcp.preview')) as HTMLElement;
    expect(shown.textContent).toBe(preview('cursor').text);

    await key(view, view.getByRole('button', { name: dom.t('mcp.write') }));
    expect(calls.some((call) => call.startsWith('write:'))).toBe(false);
    await key(view, view.getByRole('button', { name: dom.t('mcp.confirm') }), ' ');
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.written', { path: '/proj/cursor.json' }))).toBeTruthy());
    expect(calls.filter((call) => call.startsWith('write:'))).toEqual([`write:cursor:${preview('cursor').text.length}`]);
  });

  it('writes nothing when the person cancels, and copies the command with the keyboard', async () => {
    const { calls } = bridge();
    const view = dom.render(<McpConnectionSettings />);
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.file', { path: '/proj/claude-code.json' }))).toBeTruthy());
    await key(view, view.getByRole('button', { name: dom.t('mcp.write') }));
    await key(view, view.getByRole('button', { name: dom.t('mcp.cancel') }));
    expect(view.queryByRole('button', { name: dom.t('mcp.confirm') })).toBeNull();
    await key(view, view.getByRole('button', { name: dom.t('mcp.copy') }));
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.copied'))).toBeTruthy());
    expect(await navigator.clipboard.readText()).toBe('copy-of-claude-code');
    expect(calls.some((call) => call.startsWith('write:'))).toBe(false);
  });

  it('shows the refusal of the main process and offers no write for an invalid file', async () => {
    bridge({ preview: async () => ({ ok: false, message: '/proj/.mcp.json is not valid JSON' }) });
    const view = dom.render(<McpConnectionSettings />);
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.refused', { message: '/proj/.mcp.json is not valid JSON' }))).toBeTruthy());
    expect((view.getByRole('button', { name: dom.t('mcp.write') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs the self-check and shows a ready result, then the problems of a failed one', async () => {
    let ready = true;
    bridge({
      selfCheck: async () =>
        ready
          ? { ok: true, ready: true, report: { folder: '/proj', toolCount: 12, problems: [] } }
          : {
              ok: true,
              ready: false,
              report: { folder: '/proj', toolCount: 12, problems: [{ cause: 'no simulator', nextStep: 'build it' }] },
            },
    });
    const view = dom.render(<McpConnectionSettings />);
    await dom.waitFor(() => expect((view.getByRole('button', { name: dom.t('mcp.selfCheck') }) as HTMLButtonElement).disabled).toBe(false));
    await key(view, view.getByRole('button', { name: dom.t('mcp.selfCheck') }));
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.selfCheck.ready', { count: 12 }))).toBeTruthy());
    ready = false;
    await key(view, view.getByRole('button', { name: dom.t('mcp.selfCheck') }), ' ');
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.selfCheck.notReady'))).toBeTruthy());
    expect(view.getByText('no simulator')).toBeTruthy();
    expect(view.getByText('build it')).toBeTruthy();
  });

  it('says so, and offers nothing, outside the desktop app', () => {
    const view = dom.render(<McpConnectionSettings />);
    expect(view.getByText(dom.t('mcp.unavailable'))).toBeTruthy();
    expect(view.queryByRole('button', { name: dom.t('mcp.write') })).toBeNull();
  });

  it('says plainly that the server was not found, and offers neither a write nor a self-check', async () => {
    bridge({ preview: async () => ({ ok: false, missing: true, message: 'not found' }) });
    const view = dom.render(<McpConnectionSettings />);
    await dom.waitFor(() => expect(view.getByText(dom.t('mcp.commandMissing'))).toBeTruthy());
    expect((view.getByRole('button', { name: dom.t('mcp.write') }) as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByRole('button', { name: dom.t('mcp.selfCheck') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
