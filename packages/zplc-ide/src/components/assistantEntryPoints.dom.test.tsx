import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

// AIX-003: from a problem and from a failed test the Assistant opens with that context attached (the lesson and the editors are tested
// with their own components).
const dom = await setupDom();
await stubProjectLoader();
const { ProblemsPanel } = await import('./ProblemsPanel');
const { TestVerdict } = await import('./TestVerdict');
const { useAssistantEntry } = await import('../store/useAssistantEntry');
const { useAssistantProvider } = await import('../shell/useSelection');

afterEach(() => useAssistantEntry.getState().take());
const offered = (available: boolean) => dom.patchStore(useAssistantProvider, { available });

describe('the Problems panel asks the Assistant (AIX-003)', () => {
  const build = [{ type: 'error', message: 'Undeclared variable Run', file: 'src/Main.st', line: 14, column: 3, code: 'E_UNDECLARED' }];
  const panel = () => (
    <ProblemsPanel summary="1 error" live={[]} buildMessages={build} checked fileTree={null} activeFilePath="src/Main.st" onActivate={() => undefined} />
  );

  it('AIX-003 "Explain with Assistant" opens debug mode with that diagnostic and its place', async () => {
    offered(true);
    const view = dom.render(panel());
    await view.user.click(view.getByRole('button', { name: dom.t('assistant.explainProblem') }));
    const pending = useAssistantEntry.getState().pending!;
    expect(pending.mode).toBe('debug');
    expect(pending.context.fields.diagnostics).toEqual([
      { code: 'E_UNDECLARED', message: 'Undeclared variable Run', path: 'src/Main.st', line: 14, column: 3 },
    ]);
  });

  it('AIX-003 the button is not offered while no provider is configured', () => {
    offered(false);
    const view = dom.render(panel());
    expect(view.queryByRole('button', { name: dom.t('assistant.explainProblem') })).toBeNull();
  });
});

describe('the test results ask the Assistant (AIX-003)', () => {
  it('AIX-003 "Explain failure" opens debug mode with the failed scenario, assertion and checks', async () => {
    offered(true);
    const { openAssistantWith, failureIntent } = await import('../store/useAssistantEntry');
    const failure = { id: 'motor', path: 'tests/motor.scenario.json', kind: 'AT', atMs: 10, index: 1, checks: [{ signal: 'Motor.Forward', expected: false, observed: true }] };
    const view = dom.render(
      <TestVerdict sentence="1 of 3 failed" ok={false} failures={[failure]} boundary={null} onExplain={(f) => openAssistantWith(failureIntent(f))} />,
    );
    await view.user.click(view.getByRole('button', { name: dom.t('assistant.explainFailure') }));
    const pending = useAssistantEntry.getState().pending!;
    expect(pending.mode).toBe('debug');
    expect(pending.context.fields.failedScenarios?.[0]).toMatchObject({ id: 'motor', assertions: [{ index: 1, kind: 'AT', atMs: 10 }] });
  });

  it('AIX-003 a verdict without the handler shows no such button (existing behaviour of the lesson check)', () => {
    const view = dom.render(<TestVerdict sentence="failed" ok={false} failures={[{ id: 'a', path: 'tests/a.scenario.json' }]} boundary={null} />);
    expect(view.queryByRole('button', { name: dom.t('assistant.explainFailure') })).toBeNull();
  });
});
