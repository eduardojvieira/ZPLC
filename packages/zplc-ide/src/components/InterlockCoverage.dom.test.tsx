import { describe, expect, it, mock } from 'bun:test';
import { setupDom } from '../test/dom';
import { InterlockCoverage } from './InterlockCoverage';
import type { WorkspaceSafetyPresentation } from './workspaceSafetyPresentation';

const dom = await setupDom();

const pair = { outputs: ['Motor_Fwd', 'Motor_Rev'] as [string, string] };
const report = (kind: 'covered' | 'uncovered'): WorkspaceSafetyPresentation =>
  ({
    kind,
    declared: [pair],
    covered: kind === 'covered' ? [pair] : [],
    uncovered: kind === 'uncovered' ? [pair] : [],
    diagnostics: [],
  }) as unknown as WorkspaceSafetyPresentation;

describe('Declared-interlock coverage check (IDE-032) in a DOM', () => {
  it('is a named region with a heading, a check button and the claim it does not make', async () => {
    const onCheck = mock(() => undefined);
    const { user } = dom.render(<InterlockCoverage availability="ready" state="idle" busy={false} onCheck={onCheck} />);
    expect(dom.screen.getByRole('region', { name: dom.t('interlock.declaredInterlockCoverage') })).toBeTruthy();
    expect(dom.screen.getByRole('heading', { level: 2, name: dom.t('interlock.declaredInterlockCoverage') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('interlock.checksExactNeverCoverage'))).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('interlock.checkDeclaredInterlocks') }));
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('runs the check from the keyboard', async () => {
    const onCheck = mock(() => undefined);
    const { user } = dom.render(<InterlockCoverage availability="ready" state="idle" busy={false} onCheck={onCheck} />);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it('disables the button and says why when the workspace is not ready, or while it is busy', () => {
    dom.render(<InterlockCoverage availability="unsaved" state="idle" busy={false} onCheck={() => undefined} />);
    expect((dom.screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(dom.screen.getByRole('status').textContent).toBe(dom.t('interlock.saveAllChangesBefore'));
    dom.render(<InterlockCoverage availability="ready" state="idle" busy onCheck={() => undefined} />);
    expect((dom.screen.getAllByRole('button').at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the progress of a running check on the button', () => {
    dom.render(<InterlockCoverage availability="ready" state="running" busy onCheck={() => undefined} />);
    expect(dom.screen.getByRole('button', { name: dom.t('interlock.checking') })).toBeTruthy();
  });

  it('presents the answer as a table of the declared pairs, naming the outputs', () => {
    dom.render(
      <InterlockCoverage availability="ready" state={{ presentation: report('uncovered') }} busy={false} onCheck={() => undefined} />,
    );
    expect(dom.screen.getByRole('table', { name: dom.t('interlock.declaredOutputInterlockCoverag') })).toBeTruthy();
    expect(document.body.textContent).toContain('Motor_Fwd');
    expect(document.body.textContent).toContain('Motor_Rev');
  });
});
