import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';

// TST-003 and TST-008: the verdict of a run, in one component.
const dom = await setupDom();
const { TestVerdict } = await import('./TestVerdict');

const failure = {
  id: 'motor',
  path: 'tests/motor.scenario.json',
  kind: 'AT',
  atMs: 10,
  index: 2,
  checks: [{ signal: 'Motor.Forward', expected: false, observed: true }],
};

describe('the verdict (TST-003)', () => {
  it('TST-003 the verdict is one sentence with the counts', () => {
    dom.render(<TestVerdict sentence={dom.t('u2Tests.verdict.counts', { passed: 2, total: 3 })} ok={false} boundary={null} />);
    const verdict = document.querySelector('[data-test-verdict]')!;
    expect(verdict.querySelector('[data-test-verdict-sentence]')!.textContent).toBe('2 of 3 tests passed');
    expect(dom.screen.getByRole('status').textContent).toBe('2 of 3 tests passed');
  });

  it('TST-003 a failed test shows its expectation, time, expected and observed value', () => {
    dom.render(<TestVerdict sentence="0 of 1 tests passed" ok={false} failures={[failure]} boundary={null} />);
    const row = dom.within(document.querySelector<HTMLElement>('[data-test-failure]')!);
    expect(row.getByText('motor')).toBeTruthy();
    expect(row.getByText(`${dom.t('u2Tests.kind.AT')} at 10 ms`)).toBeTruthy();
    expect(row.getByText('Motor.Forward: expected false, observed true')).toBeTruthy();
  });

  it('TST-003 a value the trace does not hold is said so, not shown as false', () => {
    const missing = { ...failure, checks: [{ signal: 'Motor.Forward', expected: true }] };
    dom.render(<TestVerdict sentence="0 of 1 tests passed" ok={false} failures={[missing]} boundary={null} />);
    expect(dom.screen.getByText('Motor.Forward: expected true, observed not recorded')).toBeTruthy();
  });

  it('SCN-005 a number and a range are shown as numbers, not as true or false', () => {
    const numeric = {
      ...failure,
      checks: [
        { signal: 'fact:stored:Rack', expected: 3, observed: 2 },
        { signal: 'fact:level:Tank', expected: { min: 2, max: 4 }, observed: 1.5 },
        { signal: 'fact:level:Tank', expected: { min: 2 }, observed: 1.5 },
        { signal: 'fact:spilledL:Tank', expected: { max: 4 } },
      ],
    };
    dom.render(<TestVerdict sentence="0 of 1 tests passed" ok={false} failures={[numeric]} boundary={null} />);
    expect(dom.screen.getByText('fact:stored:Rack: expected 3, observed 2')).toBeTruthy();
    expect(dom.screen.getByText('fact:level:Tank: expected [2, 4], observed 1.5')).toBeTruthy();
    expect(dom.screen.getByText('fact:level:Tank: expected ≥ 2, observed 1.5')).toBeTruthy();
    expect(dom.screen.getByText('fact:spilledL:Tank: expected ≤ 4, observed not recorded')).toBeTruthy();
  });

  it('TST-003 the scenario step link opens the scenario file at the expectation', async () => {
    const opened: Array<[string, number | undefined]> = [];
    const traced: Array<number | undefined> = [];
    const { user } = dom.render(
      <TestVerdict
        sentence="0 of 1 tests passed"
        ok={false}
        failures={[failure]}
        boundary={null}
        onScenarioStep={(item) => opened.push([item.path, item.index])}
        onTraceTime={(item) => traced.push(item.atMs)}
      />,
    );
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.step.open') }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.trace.open') }));
    expect(opened).toEqual([['tests/motor.scenario.json', 2]]);
    expect(traced).toEqual([10]);
  });

  it('TST-003 a failure without the details of the engine offers no link it cannot follow', () => {
    dom.render(
      <TestVerdict
        sentence="0 of 1 tests passed"
        ok={false}
        failures={[{ id: 'motor', path: 'tests/motor.scenario.json' }]}
        boundary={null}
        onScenarioStep={() => undefined}
        onTraceTime={() => undefined}
      />,
    );
    expect(dom.screen.queryByRole('button')).toBeNull();
    expect(dom.screen.getByText(dom.t('u2Tests.failed.noDetail'))).toBeTruthy();
  });

  it('TST-003 passed tests are collapsed', async () => {
    const { user } = dom.render(<TestVerdict sentence="2 of 2 tests passed" ok boundary={null} passedIds={['a', 'b']} />);
    const passed = document.querySelector('details[data-test-passed]') as HTMLDetailsElement;
    expect(passed.open).toBe(false);
    expect(dom.within(passed).getByText(dom.t('u2Tests.passed.title', { count: 2 }))).toBeTruthy();
    await user.click(dom.screen.getByText(dom.t('u2Tests.passed.title', { count: 2 })));
    expect(passed.open).toBe(true);
    expect(dom.within(passed).getByText('b')).toBeTruthy();
  });
});
