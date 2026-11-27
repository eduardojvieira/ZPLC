import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { publishCommandState, resetCommandsForTest } = await import('../commands/bus');
const { auditMarkup } = await import('../ui/audit');
const { CommandEmptyState, PanelEmptyState } = await import('./panelStates');
const { ProblemsPanel } = await import('./ProblemsPanel');
const { TestsTab } = await import('./console/TestsTab');
const { EMPTY_STATE_KEY, useEmptyStateSeen } = await import('./emptyStateSeen');

beforeEach(() => {
  useEmptyStateSeen.persist.getOptions().storage!.removeItem(EMPTY_STATE_KEY);
  useEmptyStateSeen.setState({ taken: {} });
});
afterEach(() => resetCommandsForTest());

describe('panel empty states (UX-021)', () => {
  it('UX-021 shows a title, a sentence and the next action, which is the registered command by its title', () => {
    publishCommandState({ projectOpen: true });
    const out = renderToStaticMarkup(
      <CommandEmptyState title="No output yet" description="Messages appear here." actions={['build.compile']} />,
    );
    expect(out).toContain('>No output yet<');
    expect(out).toContain('>Messages appear here.<');
    expect(out).toContain('>Compile the project</button>');
    expect(out).not.toContain('disabled');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-021 offers the first next step the state allows: Step once connected, Connect before', () => {
    publishCommandState({ projectOpen: true, connected: false, mode: 'hardware' });
    const before = renderToStaticMarkup(
      <CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step', 'online.connect']} />,
    );
    expect(before).toContain('>Connect</button>');
    publishCommandState({ connected: true, vmState: 'idle' });
    const after = renderToStaticMarkup(
      <CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step', 'online.connect']} />,
    );
    expect(after).toContain('>Step one cycle</button>');
  });

  it('UX-021 disables the action when no listed command is offered, instead of hiding the panel guidance', () => {
    const out = renderToStaticMarkup(<CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step']} />);
    expect(out).toContain('disabled');
    expect(out).toContain('>No trace<');
  });

  it('UX-021 gives a panel its own next action when it is not a command', () => {
    const out = renderToStaticMarkup(
      <PanelEmptyState title="No variables watched" description="Add one." actionLabel="Add a variable" onAction={() => undefined} />,
    );
    expect(out).toContain('>Add a variable</button>');
    expect(auditMarkup(out)).toEqual([]);
  });
});

const problems = () => (
  <ProblemsPanel
    summary=""
    live={[]}
    buildMessages={[]}
    checked={false}
    fileTree={null}
    activeFilePath={undefined}
    onActivate={() => undefined}
  />
);
const tests = () => (
  <TestsTab
    runner={{ workspaceTestAvailabilityState: 'project-required' } as never}
    projectSession={0}
    compilerRunId={0}
    workspaceScenarioLink={null as never}
    canonicalWorkspaceBuildEvidence={null as never}
  />
);

describe('the real panels remember that their next action was taken (GDE-012)', () => {
  it('GDE-012 each region names its one next action the first time it is shown empty', () => {
    publishCommandState({ projectOpen: true });
    for (const [region, panel, title] of [
      ['problems', problems(), 'panel.problems.empty.title'],
      ['tests', tests(), 'panel.tests.empty.title'],
    ] as const) {
      const view = dom.render(panel);
      expect(view.container.textContent).toContain(dom.t(title));
      expect(view.container.querySelectorAll('button').length).toBe(1);
      expect(useEmptyStateSeen.getState().taken[region]).toBeUndefined();
      view.unmount();
    }
  });

  it('GDE-012 the empty state does not return once the action was taken', async () => {
    publishCommandState({ projectOpen: true });
    const first = dom.render(problems());
    await first.user.click(first.container.querySelector('button')!);
    first.unmount();
    // read through the store's own storage: the module outlives the window of one test file
    const saved = await useEmptyStateSeen.persist.getOptions().storage!.getItem(EMPTY_STATE_KEY);
    expect(saved!.state.taken).toEqual({ problems: true });
    await useEmptyStateSeen.persist.rehydrate();
    const again = dom.render(problems());
    expect(again.container.querySelectorAll('button').length).toBe(0);
    expect(again.container.textContent).toContain(dom.t('panel.problems.empty.title'));
    expect(again.container.textContent).not.toContain(dom.t('panel.problems.empty.unchecked'));
    again.unmount();
    const other = dom.render(tests());
    expect(other.container.querySelectorAll('button').length).toBe(1);
  });

  it('GDE-012 without a region the empty state is the same as before and never goes quiet', async () => {
    publishCommandState({ projectOpen: true });
    const view = dom.render(<CommandEmptyState title="T" description="D" actions={['build.compile']} />);
    await view.user.click(view.container.querySelector('button')!);
    view.unmount();
    const again = dom.render(<CommandEmptyState title="T" description="D" actions={['build.compile']} />);
    expect(again.container.textContent).toContain('D');
    expect(again.container.querySelectorAll('button').length).toBe(1);
    expect(useEmptyStateSeen.getState().taken).toEqual({});
  });
});
