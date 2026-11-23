import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../../test/dom';
import type { ConsoleEntry } from '../../types';
import { DEFAULT_SETTINGS } from '../../utils/appSettings';

const dom = await setupDom();
const { useAppSettings } = await import('../../store/useAppSettings');
const { OutputTab } = await import('./OutputTab');

const entry = (type: ConsoleEntry['type'], message: string, step?: true): ConsoleEntry => ({
  id: message,
  type,
  message,
  timestamp: new Date(0),
  ...(step ? { step } : {}),
});

const hidden = (count: number) => dom.t(count === 1 ? 'console.output.hidden.one' : 'console.output.hidden.other', { count });

afterEach(() => useAppSettings.setState({ settings: DEFAULT_SETTINGS }));

describe('Output has two levels (MSG-005)', () => {
  it('MSG-005 Output says how many detailed lines are hidden', async () => {
    const entries = [entry('info', 'Opening folder'), entry('command', '> zplc status'), entry('error', 'Build failed')];
    const { user } = dom.render(<OutputTab entries={entries} />);
    expect(dom.screen.getByText('Build failed')).toBeTruthy();
    expect(dom.screen.queryByText('Opening folder')).toBeNull();
    expect(dom.screen.getByText(hidden(2))).toBeTruthy();

    // the switch shows the detailed lines, the count is gone, and the choice is remembered
    const detailed = dom.screen.getByRole('switch', { name: dom.t('console.output.detailed') });
    expect((detailed as HTMLInputElement).checked).toBe(false);
    await user.click(detailed);
    expect(dom.screen.getByText('Opening folder')).toBeTruthy();
    expect(dom.screen.getByText('> zplc status')).toBeTruthy();
    expect(dom.screen.queryByText(hidden(2))).toBeNull();
    expect(useAppSettings.getState().settings.outputLevel).toBe('detailed');
  });

  it('MSG-005 a build writes one line with its result in the normal level', () => {
    const entries = [
      entry('info', 'Building the project…'),
      entry('info', 'Compiling Main.st'),
      entry('success', 'Build finished: 302 bytes, 1 task'),
    ];
    dom.render(<OutputTab entries={entries} />);
    expect(dom.screen.queryByText('Building the project…')).toBeNull();
    expect(dom.screen.queryByText('Compiling Main.st')).toBeNull();
    expect(dom.screen.getByText('Build finished: 302 bytes, 1 task')).toBeTruthy();
    expect(dom.screen.getByText(hidden(2))).toBeTruthy();
  });

  it('MSG-005 an info line that its call site marks as a step is shown at the normal level', () => {
    dom.render(<OutputTab entries={[entry('info', 'Build finished: 302 bytes, 1 task', true)]} />);
    expect(dom.screen.getByText('Build finished: 302 bytes, 1 task')).toBeTruthy();
    expect(dom.screen.queryByText(hidden(1))).toBeNull();
  });

  it('MSG-004 a failure is never hidden at the normal level: what failed, where, what to do (toolbarMsg.noFileSelectedTo)', () => {
    const failed = dom.t('toolbarMsg.noFileSelectedTo');
    dom.render(<OutputTab entries={[entry('error', failed), entry('warning', 'Build cancelled')]} />);
    expect(dom.screen.getByText(failed)).toBeTruthy();
    expect(dom.screen.getByText('Build cancelled')).toBeTruthy();
    expect(dom.screen.queryByText(/detailed lines? hidden/i)).toBeNull();
  });

  it('MSG-005 an empty Output keeps its empty state and offers the build', () => {
    dom.render(<OutputTab entries={[]} />);
    expect(dom.screen.getByText(dom.t('panel.output.empty.title'))).toBeTruthy();
  });
});
