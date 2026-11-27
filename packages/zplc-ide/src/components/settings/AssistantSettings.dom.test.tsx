import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

// SHL-011: the provider form is disabled while a change is in flight, and each change says how it ended (it moved here from the
// Agent tab, whose source pins covered the same gates). The form has no gate on a running agent request: it is not part of the Assistant.
const dom = await setupDom();
await stubProjectLoader();
const { AssistantSettings } = await import('./AssistantSettings');
const { useAssistantProvider } = await import('../../shell/useSelection');

type Answer = Promise<unknown>;
interface Bridge {
  saveConfig: () => Answer;
  storeKey: (key: string) => Answer;
  clearKey: () => Answer;
  testConnection?: () => Answer;
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  // The form reads the provider status of the bridge into the shared store: the next file starts with no provider again.
  useAssistantProvider.setState({ available: false });
});

function bridge(answers: Bridge) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    aiProvider: {
      getStatus: async () => ({ configured: true, enabled: true, keyStored: true, vaultAvailable: true }),
      getConfig: async () => ({ enabled: true, endpoint: 'https://example.test/v1', model: 'm1' }),
      ...answers,
    },
  };
}
const ok: Answer = Promise.resolve({ ok: true });
const ACTIONS = [
  { name: 'saving the configuration', button: 'configEditor.save', say: 'assistant.configSaved' },
  { name: 'storing the key', button: 'console.storeKey', say: 'assistant.keyStored' },
  { name: 'clearing the key', button: 'console.clearKey', say: 'assistant.keyCleared' },
] as const;
const FAILED = { configEditor: 'assistant.configNotSaved', console: 'assistant.keyNotStored' } as const;

async function render(answers: Bridge) {
  bridge(answers);
  const view = dom.render(<AssistantSettings />);
  await dom.waitFor(() =>
    expect((view.getByLabelText(dom.t('console.endpoint')) as HTMLInputElement).value).toBe('https://example.test/v1'),
  );
  return view;
}
async function press(view: Awaited<ReturnType<typeof render>>, action: (typeof ACTIONS)[number]) {
  if (action.button === 'console.storeKey') await view.user.type(view.getByLabelText(dom.t('console.apiKey')), 'k-1');
  await view.user.click(view.getByRole('button', { name: dom.t(action.button) }));
}

describe('Assistant provider settings (SHL-011) in a DOM', () => {
  for (const action of ACTIONS) {
    it(`SHL-011 the form is disabled while ${action.name} is in flight, and says it succeeded`, async () => {
      let release: (value: unknown) => void = () => undefined;
      const pending: Answer = new Promise((resolve) => (release = resolve));
      const view = await render({ saveConfig: () => pending, storeKey: () => pending, clearKey: () => pending });
      await press(view, action);
      const fieldset = document.querySelector('fieldset') as HTMLFieldSetElement;
      await dom.waitFor(() => expect(fieldset.disabled).toBe(true));
      dom.act(() => release({ ok: true }));
      await dom.waitFor(() => expect(fieldset.disabled).toBe(false));
      expect(view.getByText(dom.t(action.say))).toBeTruthy();
    });
  }

  it('SHL-011 each change presents a failure code, an untrusted answer and a thrown error', async () => {
    const failing = Promise.resolve({ ok: false, code: 'AI_TIMEOUT' });
    const untrusted = Promise.resolve({ nonsense: true });
    const thrown = Promise.reject(new Error('down'));
    thrown.catch(() => undefined);
    const view = await render({ saveConfig: () => failing, storeKey: () => untrusted, clearKey: () => thrown });
    await press(view, ACTIONS[0]);
    await dom.waitFor(() => expect(view.getByText(dom.t(`${FAILED.configEditor}`, { code: 'AI_TIMEOUT' }))).toBeTruthy());
    await press(view, ACTIONS[1]);
    await dom.waitFor(() => expect(view.getByText(dom.t('assistant.keyStoreUntrusted'))).toBeTruthy());
    await press(view, ACTIONS[2]);
    await dom.waitFor(() => expect(view.getByText(dom.t('assistant.keyNotClearedThrown'))).toBeTruthy());
  });

  it('SHL-011 a failed key store keeps the typed key in the field so it can be tried again', async () => {
    const view = await render({
      saveConfig: () => ok,
      storeKey: () => Promise.resolve({ ok: false, code: 'AI_VAULT_UNAVAILABLE' }),
      clearKey: () => ok,
    });
    await press(view, ACTIONS[1]);
    await dom.waitFor(() => expect(view.getByText(dom.t(FAILED.console, { code: 'AI_VAULT_UNAVAILABLE' }))).toBeTruthy());
    expect((view.getByLabelText(dom.t('console.apiKey')) as HTMLInputElement).value).toBe('k-1');
  });
});

// AIX-006, AI-17: the connection test says plainly what is wrong and what to do; the form shows examples of what to type.
describe('the connection test and the examples (AIX-006)', () => {
  const unused = { saveConfig: () => ok, storeKey: () => ok, clearKey: () => ok };
  const test = (view: Awaited<ReturnType<typeof render>>) => view.user.click(view.getByRole('button', { name: dom.t('assistant.test') }));

  it('AIX-006 a good probe says it worked and how long it took', async () => {
    const view = await render({ ...unused, testConnection: () => Promise.resolve({ ok: true, latencyMs: 412 }) });
    await test(view);
    await dom.waitFor(() => expect(view.getByText(dom.t('assistant.test.ok', { ms: 412 }))).toBeTruthy());
  });

  it('AIX-006 a refused endpoint says it is not allowed and why: https, or http to localhost, 127.0.0.1 or [::1]', async () => {
    const view = await render({ ...unused, testConnection: () => Promise.resolve({ ok: false, code: 'AI_CONTEXT_REJECTED' }) });
    await test(view);
    const text = (await view.findByText(dom.t('assistant.test.endpointNotAllowed'))).textContent!;
    for (const part of ['https', 'localhost', '127.0.0.1', '[::1]']) expect(text).toContain(part);
    expect(text).not.toContain('AI_CONTEXT_REJECTED');
  });

  it('AIX-006 the same plain reason is given when saving an endpoint the provider refuses', async () => {
    const view = await render({ ...unused, saveConfig: () => Promise.resolve({ ok: false, code: 'AI_CONTEXT_REJECTED' }) });
    await view.user.clear(view.getByLabelText(dom.t('console.endpoint')));
    await view.user.type(view.getByLabelText(dom.t('console.endpoint')), 'http://192.168.1.5:11434');
    await view.user.click(view.getByRole('button', { name: dom.t('configEditor.save') }));
    expect(await view.findByText(dom.t('assistant.test.endpointNotAllowed'))).toBeTruthy();
  });

  it('AIX-006 an unreachable endpoint says what to check, with no raw code', async () => {
    const view = await render({ ...unused, testConnection: () => Promise.resolve({ ok: false, code: 'AI_PROVIDER_UNREACHABLE' }) });
    await test(view);
    expect(await view.findByText(dom.t('console.providerUnreachable'))).toBeTruthy();
  });

  it('AIX-006 the form shows a hosted and a local example, in both languages', async () => {
    const view = await render({ ...unused });
    expect(view.getByText(/https:\/\/api\.openai\.com/)).toBeTruthy();
    expect(view.getByText(/http:\/\/localhost:11434/)).toBeTruthy();
    expect(view.getByText(/http:\/\/localhost:1234/)).toBeTruthy();
  });
});
