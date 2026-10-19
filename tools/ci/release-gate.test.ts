// VF-009: a release is gated on the end-to-end journeys on Linux. The gate is the reusable ci.yml run that
// release.yml calls (verify-release-candidate), whose typescript job runs the journeys under a virtual display; a
// release job that builds or publishes needs that run to have succeeded. The workflows are parsed as YAML, never
// matched as text. A hosted run is the only proof that GitHub honours them; neither workflow is executed here.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

type Step = { name?: string; run?: string; if?: string; 'continue-on-error'?: boolean | string };
type Job = { needs?: string | string[]; if?: string; uses?: string; 'continue-on-error'?: boolean | string; steps?: Step[] };
type Workflow = { on: Record<string, unknown>; jobs: Record<string, Job> };

const parse = (name: string) => Bun.YAML.parse(readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8')) as Workflow;
const ci = parse('ci.yml');
const release = parse('release.yml');

const GATE = 'verify-release-candidate';
/** Jobs that start no build and publish nothing before the gate: the identity check itself, the gate, and the notes renderer. */
const NOT_GATED = new Set(['validate-version', GATE, 'render-release-notes']);
/** REL-032: kept, and never a reason for a release run to fail or wait. */
const NEVER_BLOCKS = 'verify-linux-x64-payload-reproducibility';

const needsOf = (job: Job): string[] => [job.needs ?? []].flat();
const reaches = (name: string, target: string, seen = new Set<string>()): boolean => {
  if (seen.has(name)) return false;
  seen.add(name);
  return needsOf(release.jobs[name]!).some((need) => need === target || reaches(need, target, seen));
};

describe('the release is gated on the Linux journeys (VF-009)', () => {
  it('calls the canonical ci.yml for its own commit, and ci.yml can be called', () => {
    expect(release.jobs[GATE]?.uses).toBe('./.github/workflows/ci.yml');
    expect(Object.keys(ci.on)).toContain('workflow_call');
  });

  it('runs the journeys in a ci.yml job that no condition skips and no failure is allowed to pass', () => {
    const owner = Object.values(ci.jobs).find((job) => job.steps?.some((step) => step.run?.includes('smoke:journeys')));
    expect(owner).toBeDefined();
    expect(owner!.if).toBeUndefined();
    expect(owner!['continue-on-error']).toBeUndefined();
    const step = owner!.steps!.find((candidate) => candidate.run?.includes('smoke:journeys'))!;
    expect(step.run).toContain('xvfb-run');
    expect(step.if).toBeUndefined();
    expect(step['continue-on-error']).toBeUndefined();
  });

  it('lets no job that builds or publishes start without the gate, and none run when the gate failed', () => {
    for (const [name, job] of Object.entries(release.jobs)) {
      if (NOT_GATED.has(name)) continue;
      expect(reaches(name, GATE)).toBe(true);
      // `always()` and `!cancelled()` run a job whatever its needs ended with: the condition must then ask for the gate (or
      // for a job that asked for it) to have succeeded.
      if (job.if && /always\(\)|!cancelled\(\)/.test(job.if)) {
        const asked = [...job.if.matchAll(/needs\.([\w-]+)\.result == 'success'/g)].map((match) => match[1]!);
        expect(asked.some((need) => need === GATE || reaches(need, GATE))).toBe(true);
      }
    }
  });

  it('allows a job in the release to continue on error only for the reproducibility check, whose result never blocks the release', () => {
    const lenient = Object.entries(release.jobs).filter(([, job]) => job['continue-on-error'] !== undefined).map(([name]) => name);
    expect(lenient).toEqual([NEVER_BLOCKS]);
    expect(Object.values(release.jobs).some((job) => needsOf(job).includes(NEVER_BLOCKS) && job.if?.includes(`needs.${NEVER_BLOCKS}.result == 'success'`))).toBe(false);
  });
});
