import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

// SHL-011: the provider form is disabled while a change is in flight, and each change says how it ended (it moved here from the
// Agent tab, whose source pins covered the same gates). The form has no gate on a running agent request: it is not part of the Assistant.
const dom = await setupDom();
await stubProjectLoader();
const { AssistantSettings } = await import('./AssistantSettings');

type Answer = Promise<unknown>;
interface Bridge {
  saveConfig: () => Answer;
  storeKey: (key: string) => Answer;
  clearKey: () => Answer;
}

afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
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
