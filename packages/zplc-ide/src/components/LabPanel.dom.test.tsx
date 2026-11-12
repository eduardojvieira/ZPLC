import { beforeAll, describe, expect, it } from 'bun:test';
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

const motorRun = {
  kind: 'passed',
  message: 'ok',
  diagnostics: [],
  artifacts: [],
  hasEvidence: true,
  preview: {
    scenarios: [
      {
        id: 'motor-run',
        passed: true,
        truncated: false,
        assertions: [],
        samples: [
          {
            atMs: 100,
            outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': true },
            plant: { kind: 'motor-v1', atSpeedInput: true, speedPermilleAfterTick: 1000 },
          },
        ],
      },
    ],
  },
} as never;

describe('the replay of a recorded plant trace (LRN-018, LRN-020) in a DOM', () => {
  it('without a recorded run shows nothing: the plant document owns the empty state', () => {
    const { container } = dom.render(<LabPanel presentation={null} />);
    expect(container.textContent).toBe('');
  });

  it('with a recorded run is a named region that says it is a replay and not live', () => {
    dom.render(<LabPanel presentation={motorRun} />);
    expect(dom.screen.getByRole('region', { name: dom.t('lab.labRecordedScenario') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('lab.recordedNativePosixHost'))).toBeTruthy();
    expect(dom.screen.queryByRole('button', { name: dom.t('console.runHostScenarios') })).toBeNull();
  });
});
