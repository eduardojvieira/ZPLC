import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

// AIX-003, AIX-004, AI-18, AI-20: one Assistant, with its name and its modes in the language of the interface, four ways in with the
// context attached, places that open on a click, and a bounded follow-up.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { AssistantView } = await import('./AssistantView');
const { diagnosticIntent, lessonIntent, openAssistantWith, useAssistantEntry } = await import('../store/useAssistantEntry');
const { useAssistantProvider } = await import('../shell/useSelection');

type Sent = Record<string, unknown>;
const sent: Sent[] = [];
const answers: unknown[] = [];
let status: Record<string, unknown> = { configured: true, enabled: true, keyStored: true, vaultAvailable: true };

function bridge() {
  sent.length = 0;
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    aiProvider: {
      getStatus: async () => status,
      request: async (request: Sent) => {
        sent.push(request);
        return answers.shift() ?? { ok: true, answer: `answer ${sent.length}` };
      },
      cancel: async () => ({ requested: false }),
    },
    workspaceTests: undefined,
  };
}
const setStatus = (next: Record<string, unknown>) => {
  status = next;
};
function project(extra: Record<string, unknown> = {}) {
  dom.patchStore(useIDEStore, {
    isProjectOpen: true,
    projectSession: 7,
    workspaceScenarioLink: { projectSession: 7, workspaceId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51' },
    activeFileId: null,
    fileTree: null,
    ...extra,
  } as never);
}
afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  useAssistantEntry.getState().take();
  useAssistantProvider.setState({ available: false });
  answers.length = 0;
  status = { configured: true, enabled: true, keyStored: true, vaultAvailable: true };
});

async function render(locale: 'en' | 'es' = 'en') {
  bridge();
  project();
  const view = dom.render(<AssistantView />, { locale });
  await dom.settle();
  const send = () => view.getByRole('button', { name: dom.tFor(locale)('console.sendRequest') });
  await dom.waitFor(() => expect(view.getByRole('button', { name: dom.tFor(locale)('console.refreshStatus') })).toBeTruthy());
  const prompt = () => view.getByLabelText(dom.tFor(locale)('console.request')) as HTMLTextAreaElement;
  const ask = async (text: string) => {
    await view.user.clear(prompt());
    await view.user.type(prompt(), text);
    await dom.waitFor(() => expect((send() as HTMLButtonElement).disabled).toBe(false));
    await view.user.click(send());
    await dom.waitFor(() => expect(view.queryByText(new RegExp(`answer ${sent.length}$`))).toBeTruthy());
  };
  return { ...view, send, prompt, ask };
}

describe('one Assistant, named and worded in the interface language (AI-20)', () => {
  it('AI-20 says Assistant in English and Asistente in Spanish, and never Agent or Agente', async () => {
    const en = await render('en');
    expect(en.getByRole('heading', { name: 'Assistant' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bagent\b/i);
    en.unmount();
    const es = await render('es');
    expect(es.getByRole('heading', { name: 'Asistente' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bagente\b/i);
  });

  it('AI-20 shows the four modes in the interface language, each with a short tooltip', async () => {
    const en = await render('en');
    expect(en.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Ask', 'Plan', 'Edit', 'Debug']);
    for (const mode of ['ask', 'plan', 'edit', 'debug'] as const) {
      await en.user.hover(en.getByRole('radio', { name: dom.t(`assistant.mode.${mode}`) }));
      expect(await en.findByText(dom.t(`assistant.mode.${mode}.tip`))).toBeTruthy();
      await en.user.unhover(en.getByRole('radio', { name: dom.t(`assistant.mode.${mode}`) }));
    }
    en.unmount();
    const es = await render('es');
    expect(es.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Preguntar', 'Planificar', 'Editar', 'Depurar']);
  });
});

describe('the Assistant opened with a context (AIX-003)', () => {
  it('AIX-003 a problem selects debug, prefills the request, shows a removable chip and sends the diagnostic', async () => {
    const view = await render();
    dom.act(() =>
      openAssistantWith(diagnosticIntent({ message: 'Undeclared variable Run', file: 'src/Main.st', line: 14, code: 'E_UNDECLARED' })),
    );
    await dom.waitFor(() => expect(view.getByRole('radio', { name: 'Debug' }).getAttribute('aria-checked')).toBe('true'));
    expect(view.prompt().value.length).toBeGreaterThan(5);
    expect(document.activeElement).toBe(view.prompt());
    const chip = view.getByRole('group', { name: dom.t('assistant.chip.region') });
    expect(chip.textContent).toContain('E_UNDECLARED');
    await view.user.click(view.getByRole('button', { name: dom.t('assistant.chip.remove') }));
    expect(view.queryByRole('group', { name: dom.t('assistant.chip.region') })).toBeNull();
  });

  it('AIX-003 the attached diagnostic goes with the request, once, through the provider; a removed chip goes with nothing', async () => {
    const view = await render();
    dom.act(() =>
      openAssistantWith(diagnosticIntent({ message: 'Undeclared variable Run', file: 'src/Main.st', line: 14, code: 'E_UNDECLARED' })),
    );
    await dom.waitFor(() => expect(view.prompt().value.length).toBeGreaterThan(5));
    await view.user.click(view.send());
    await dom.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      mode: 'debug',
      locale: 'en',
      diagnostics: [{ code: 'E_UNDECLARED', message: 'Undeclared variable Run', path: 'src/Main.st', line: 14 }],
    });
    await view.user.click(view.getByRole('button', { name: dom.t('assistant.chip.remove') }));
    await view.ask('and now?');
    expect(sent[1]!.diagnostics ?? []).toEqual([]);
  });

  it('AIX-003 the lesson hint selects ask, attaches the lesson, and the Assistant never says a lesson is passed', async () => {
    const view = await render();
    dom.act(() => openAssistantWith(lessonIntent('ld-no-nc-contacts', 'No NC contacts')));
    await dom.waitFor(() => expect(view.getByRole('radio', { name: 'Ask' }).getAttribute('aria-checked')).toBe('true'));
    expect(view.getByText(dom.t('assistant.lessonStance'))).toBeTruthy();
    await view.user.click(view.send());
    await dom.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ mode: 'ask', lessonContext: { lessonId: 'ld-no-nc-contacts' } });
    expect(document.body.textContent).not.toMatch(/\b(you have passed|lesson passed|passed the lesson)\b/i);
  });
});

describe('places in an answer open on a click (AIX-004)', () => {
  it('AIX-004 a file and line of the answer is a button that opens that line; an unknown place stays text', async () => {
    const view = await render();
    const navigated: Array<[string, number, number]> = [];
    project({
      fileTree: {
        id: 'root',
        name: 'p',
        type: 'directory',
        path: '',
        children: [{ id: 'file:src/Main.st', name: 'Main.st', type: 'file', path: 'src/Main.st' }],
      },
      loadedFiles: new Map([['file:src/Main.st', { id: 'file:src/Main.st', path: 'src/Main.st', content: 'a\nb\nc\nd' }]]),
      navigateToCompilerDiagnostic: async (file: string, line: number, column: number) => {
        navigated.push([file, line, column]);
        return true;
      },
    });
    answers.push({ ok: true, answer: 'The fault is at src/Main.st:3 and also in src/Gone.st:1.' });
    await view.user.type(view.prompt(), 'where?');
    await view.user.click(view.send());
    const place = await view.findByRole('button', { name: 'src/Main.st:3' });
    await view.user.click(place);
    expect(navigated).toEqual([['src/Main.st', 3, 1]]);
    expect(view.queryByRole('button', { name: 'src/Gone.st:1' })).toBeNull();
    expect(view.getByText(/src\/Gone\.st:1/)).toBeTruthy();
  });
});

describe('a key-free endpoint without an OS vault (AIX-006, AI-17)', () => {
  const status = (vaultReason: string) => ({ configured: true, enabled: true, keyStored: false, vaultAvailable: false, vaultReason });

  it('AIX-006 is offered and sends, and the status line says there is no key vault, never that one is available', async () => {
    for (const [locale, line] of [
      ['en', 'Provider enabled · no key stored · no OS key vault, so a key cannot be stored.'],
      ['es', 'Proveedor habilitado · sin clave almacenada · sin almacén de claves del sistema, por lo que no se puede almacenar una clave.'],
    ] as const) {
      for (const reason of ['unavailable', 'insecure-backend']) {
        setStatus(status(reason));
        const view = await render(locale);
        await dom.waitFor(() => expect(view.getByText(line, { exact: true }), `${locale} ${reason}`).toBeTruthy());
        expect(view.container.textContent).not.toMatch(/vault available|almacén de claves disponible/);
        await view.ask('what is a scan?');
        expect(sent.at(-1)).toMatchObject({ mode: 'ask', prompt: 'what is a scan?' });
        view.unmount();
      }
    }
  }, 30_000);

  it('AIX-006 with a vault the status line is the one it always was', async () => {
    const view = await render('en');
    await dom.waitFor(() => expect(view.getByText('Provider enabled · key stored · vault available.', { exact: true })).toBeTruthy());
  });

  it('AIX-006 with a vault and no key the Spanish line is the one it always was', async () => {
    setStatus({ configured: true, enabled: true, keyStored: false, vaultAvailable: true });
    const view = await render('es');
    await dom.waitFor(() =>
      expect(view.getByText('Proveedor habilitado · clave no almacenada · almacén de claves disponible.', { exact: true })).toBeTruthy(),
    );
  });
});

describe('the follow-up turns (AI-18)', () => {
  it('AI-18 a plain first request carries no history, no selection and no attached context (existing behaviour)', async () => {
    const view = await render();
    await view.ask('what is a scan?');
    expect(Object.keys(sent[0]!).sort()).toEqual(['locale', 'mode', 'prompt', 'workspaceId']);
    expect(sent[0]).toMatchObject({ mode: 'ask', prompt: 'what is a scan?' });
  });

  it('AI-18 sends at most the last three exchanges, and New conversation starts again', async () => {
    const view = await render();
    for (let n = 1; n <= 5; n += 1) await view.ask(`question ${n}`);
    const history = sent[4]!.history as Array<{ role: string; text: string }>;
    expect(history.map((turn) => turn.text)).toEqual(['question 2', 'answer 2', 'question 3', 'answer 3', 'question 4', 'answer 4']);
    expect(history.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    await view.user.click(view.getByRole('button', { name: dom.t('assistant.newConversation') }));
    await view.ask('fresh');
    expect(sent[5]!.history).toBeUndefined();
  });
});
