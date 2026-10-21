import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { OperationalStatusBar, OperationalStatusView } = await import('./OperationalStatusBar');

const idle = {
  mode: 'simulate' as const,
  adapterType: null,
  connected: false,
  status: { text: 'Ready', tone: 'neutral' as const },
  connecting: false,
  faulted: false,
};

describe('Operational status bar and force banner (IDE-029, UX-018) in a DOM', () => {
  it('shows nothing until a project is open', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false });
    const { container } = dom.render(<OperationalStatusBar {...idle} />);
    expect(container.textContent).toBe('');
  });

  it('is a labelled region with the connection and the run status as live status regions', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(<OperationalStatusBar {...idle} />);
    expect(dom.screen.getByRole('region', { name: dom.t('status.label') })).toBeTruthy();
    const statuses = dom.screen.getAllByRole('status');
    expect(statuses.length).toBe(2);
    for (const status of statuses) expect(status.getAttribute('aria-live')).toBe('polite');
    expect(statuses.map((status) => status.textContent).join(' ')).toContain('Ready');
  });

  it('tells a person using a screen reader that a connection is being made, by words', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(<OperationalStatusBar {...idle} mode="hardware" adapterType="serial" connecting />);
    const indicator = document.querySelector('[data-connection]') as HTMLElement;
    expect(indicator.getAttribute('role')).toBe('status');
    expect(indicator.getAttribute('data-connection')).toBe('hardware-connecting');
    expect(indicator.textContent).toContain(dom.t('connection.hardware.connecting'));
  });

  it('announces unconfirmed forces as an alert, and active forces as a note without alert', () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Running', tone: 'success' },
            force: { kind: 'unconfirmed', text: 'Force state unconfirmed' },
          } as never
        }
      />,
    );
    expect(dom.screen.getByRole('alert').textContent).toBe('Force state unconfirmed');
  });

  it('an active force is shown without raising an alert', () => {
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Running', tone: 'success' },
            force: { kind: 'active', text: '2 active forces' },
          } as never
        }
      />,
    );
    expect(dom.screen.queryByRole('alert')).toBeNull();
    expect(dom.screen.getByText('2 active forces')).toBeTruthy();
  });

  it('shows the debug state and the limits note when given', () => {
    dom.render(
      <OperationalStatusView
        indicator={{ state: 'simulation', label: 'Simulation', tone: 'info', icon: 'monitor' } as never}
        debug="Paused at line 4"
        presentation={
          {
            mode: 'Simulation',
            runtime: 'Native',
            status: { text: 'Paused', tone: 'attention' },
            limits: 'Timing is not real time',
          } as never
        }
      />,
    );
    expect(dom.screen.getByText('Paused at line 4')).toBeTruthy();
    expect(dom.screen.getByRole('note').textContent).toBe('Timing is not real time');
  });
});
