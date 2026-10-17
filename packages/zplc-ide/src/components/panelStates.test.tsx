import { afterEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { publishCommandState, resetCommandsForTest } from '../commands/bus';
import { auditMarkup } from '../ui/audit';
import { CommandEmptyState, PanelEmptyState } from './panelStates';


afterEach(() => resetCommandsForTest());

describe('panel empty states (UX-021)', () => {
  it('UX-021 shows a title, a sentence and the next action, which is the registered command by its title', () => {
    publishCommandState({ projectOpen: true });
    const out = renderToStaticMarkup(<CommandEmptyState title="No output yet" description="Messages appear here." actions={['build.compile']} />);
    expect(out).toContain('>No output yet<');
    expect(out).toContain('>Messages appear here.<');
    expect(out).toContain('>Compile the project</button>');
    expect(out).not.toContain('disabled');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-021 offers the first next step the state allows: Step once connected, Connect before', () => {
    publishCommandState({ projectOpen: true, connected: false });
    const before = renderToStaticMarkup(<CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step', 'online.connect']} />);
    expect(before).toContain('>Connect</button>');
    publishCommandState({ connected: true, vmState: 'idle' });
    const after = renderToStaticMarkup(<CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step', 'online.connect']} />);
    expect(after).toContain('>Step one cycle</button>');
  });

  it('UX-021 disables the action when no listed command is offered, instead of hiding the panel guidance', () => {
    const out = renderToStaticMarkup(<CommandEmptyState title="No trace" description="Step to collect." actions={['debug.step']} />);
    expect(out).toContain('disabled');
    expect(out).toContain('>No trace<');
  });

  it('UX-021 gives a panel its own next action when it is not a command', () => {
    const out = renderToStaticMarkup(<PanelEmptyState title="No variables watched" description="Add one." actionLabel="Add a variable" onAction={() => undefined} />);
    expect(out).toContain('>Add a variable</button>');
    expect(auditMarkup(out)).toEqual([]);
  });
});
