import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { tn } from '../i18n';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';

// TST-004: the evidence record of 2.0 is complete behind Details. MSG-006: a hash outside Details is short, with a copy action.
const dom = await setupDom();
const { WorkspaceTestResult } = await import('./WorkspaceTestResult');

const sha = 'a'.repeat(64);
const traceSha = 'b'.repeat(64);
const presentation = {
  kind: 'assertion-failed',
  message: 'Host POSIX scenario assertions failed.',
  scenarioCount: 1,
  diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'a check failed', path: 'tests/motor.scenario.json' }],
  artifacts: [
    { kind: 'zplc', sha256: sha, byteLength: 12 },
    { kind: 'trace', sha256: traceSha, byteLength: 34 },
  ],
  hasEvidence: true,
  savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
  preview: {
    traceEvidenceSha256: traceSha,
    totalScenarioCount: 1,
    scenarios: [
      {
        id: 'motor',
        path: 'tests/motor.scenario.json',
        passed: false,
        totalSamples: 2,
        totalSignals: 1,
        totalAssertions: 1,
        truncated: false,
        assertions: [
          { kind: 'AT', passed: false, atMs: 10, index: 0, checks: [{ signal: 'Motor.Forward', expected: false, observed: true }] },
        ],
        samples: [
          { atMs: 0, outputs: { 'Motor.Forward': false } },
          { atMs: 10, outputs: { 'Motor.Forward': true } },
        ],
      },
    ],
  },
} as unknown as WorkspaceTestPresentation;
const verified = { kind: 'verified', zplc: presentation.artifacts[0], trace: presentation.artifacts[1] } as never;
const render = (over: Partial<Parameters<typeof WorkspaceTestResult>[0]> = {}) =>
  dom.render(
    <WorkspaceTestResult
      presentation={presentation}
      buildLink={verified}
      onRunScenario={() => undefined}
      scenarioRunDisabled={false}
      {...over}
    />,
  );

describe('the evidence record behind Details (TST-004)', () => {
  it('TST-004 the Details disclosure is closed and holds every field of the 2.0 evidence view', () => {
    render();
    const details = document.querySelector('details[data-test-details]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(dom.within(details).getByText(dom.t('u2Tests.details.title'))).toBeTruthy();
    const inside = dom.within(details);
    // the fields of the 2.0 view, one by one
    expect(inside.getByText(dom.t('console.scenarioEvidenceRecordedTest'))).toBeTruthy(); // the recorded scenarios
    expect(inside.getByText('motor')).toBeTruthy();
    expect(inside.getByRole('table', { name: dom.t('console.recordedSampledTimelineFor', { id: 'motor' }) })).toBeTruthy(); // the trace
    expect(inside.getByRole('table', { name: dom.t('console.recordedAssertionsFor', { id: 'motor' }) })).toBeTruthy();
    expect(inside.getByRole('table', { name: dom.t('console.nativePosixTestEvidence') })).toBeTruthy(); // the artifacts
    expect(inside.getByText('zplc')).toBeTruthy();
    expect(inside.getByText('trace')).toBeTruthy();
    expect(inside.getAllByText(`${sha.slice(0, 12)}…`).length).toBeGreaterThan(0); // the hashes
    expect(inside.getByText(`${traceSha.slice(0, 12)}…`)).toBeTruthy();
    expect(inside.getByText('12')).toBeTruthy(); // the sizes
    expect(inside.getByText('34')).toBeTruthy();
    expect(inside.getByText(dom.t('console.canonicalSavedBuildLinked'))).toBeTruthy(); // the link to the build
    expect(inside.getByText(dom.t('console.logicalSingleTaskScan'))).toBeTruthy();
    expect(inside.getByText(tn('console.scenariosPassed', 1))).toBeTruthy(); // the count of scenarios
    expect(details.textContent).toContain(tn('console.savedInputs', 3)); // the saved inputs
    // the diagnostics stay outside: they say why the run failed
    expect(details.contains(dom.screen.getByText('SCENARIO_ASSERTION_FAILED'))).toBe(false);
  });

  it('TST-004 the headline and the old badge are not in the evidence record any more', () => {
    render();
    expect(dom.screen.queryByText(presentation.message)).toBeNull();
    expect(dom.screen.queryByText('Host evidence only')).toBeNull();
    expect(dom.screen.queryByText(dom.t('console.recordedDuringThisHost'))).toBeNull();
  });

  it('TST-004 pointing at a time opens Details and marks that sample in the recorded trace', () => {
    render({ detailsOpen: true, highlight: { scenarioId: 'motor', atMs: 10 } });
    const details = document.querySelector('details[data-test-details]') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    const marked = details.querySelectorAll('[data-trace-highlight]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain('10');
  });

  it('MSG-006 a hash outside Details is shortened with a copy action', async () => {
    const copied: string[] = [];
    const { user } = render();
    // user-event installs its own clipboard when it is set up: the test's goes in after it
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
    const outside = [...document.querySelectorAll('[data-hash-short]')].filter((node) => !node.closest('details'));
    expect(outside).toHaveLength(1);
    expect(outside[0]!.textContent).toBe(`${sha.slice(0, 8)}…`);
    await user.click(dom.screen.getByRole('button', { name: dom.t('u2Tests.hash.copy') }));
    expect(copied).toEqual([sha]);
  });
});
