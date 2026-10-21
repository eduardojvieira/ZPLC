import { beforeAll, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { LabPanel } = await import('./LabPanel');

beforeAll(() => {
  // happy-dom has no motion preference; the panel reads one
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

describe('Lab (LRN-018, LRN-020) in a DOM', () => {
  it('without a recorded run is a named region with a heading that says what to do', () => {
    dom.render(<LabPanel presentation={null} runDisabled={false} running={false} onRun={() => undefined} />);
    expect(dom.screen.getByRole('region', { name: dom.t('console.tab.lab') })).toBeTruthy();
    expect(dom.screen.getByRole('heading', { level: 2, name: dom.t('console.tab.lab') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('lab.runTheSavedHost'))).toBeTruthy();
  });

  it('runs the saved scenarios by click and by keyboard', async () => {
    const onRun = mock(() => undefined);
    const { user } = dom.render(<LabPanel presentation={null} runDisabled={false} running={false} onRun={onRun} />);
    const run = dom.screen.getByRole('button', { name: dom.t('console.runHostScenarios') });
    await user.click(run);
    run.focus();
    await user.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledTimes(2);
  });

  it('disables the run while it is disabled or running, and names the running state', () => {
    dom.render(<LabPanel presentation={null} runDisabled={false} running onRun={() => undefined} />);
    expect((dom.screen.getByRole('button', { name: dom.t('lab.runningScenarios') }) as HTMLButtonElement).disabled).toBe(true);
  });
});
