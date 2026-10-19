// Structural checks on the triggers that the specification names (VF-016, REL-033). The workflows are parsed as YAML, never
// matched as text, and only what the requirement names is asserted: a hosted run is the only proof that GitHub honours it.
import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

type Job = { needs?: string | string[]; if?: string; steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }>; permissions?: Record<string, string> };
type Workflow = { on: Record<string, { branches?: string[]; cron?: string }[] | { branches?: string[] } | null>; jobs: Record<string, Job> };

const folder = new URL('../../.github/workflows/', import.meta.url);
const workflows = readdirSync(folder).filter((name) => name.endsWith('.yml')).map((name) => [name, Bun.YAML.parse(readFileSync(new URL(name, folder), 'utf8')) as Workflow] as const);
const workflow = (name: string) => workflows.find(([file]) => file === name)![1];

describe('the documentation site is deployed from the branch that holds 2.0', () => {
  it.each(['push', 'pull_request'])('on %s: the default branches and the 2.0 branch (decision D-12 may move 2.0 to master)', (event) => {
    expect((workflow('deploy-docs.yml').on[event] as { branches?: string[] }).branches).toEqual(expect.arrayContaining(['master', 'main', 'zplc-2.0-candidate']));
  });

  it('names the latest published release to the build, so that the site shows its version', () => {
    const steps = workflow('deploy-docs.yml').jobs.build!.steps!;
    const naming = steps.findIndex((step) => step.run?.includes('ZPLC_RELEASE_TAG'));
    expect(naming).toBeGreaterThan(-1);
    expect(naming).toBeLessThan(steps.findIndex((step) => step.run?.includes('bun run build')));
    expect(steps[naming]!.run).toContain('gh release list');
    expect(steps[naming]!.run).toContain('--exclude-drafts');
  });
});

describe('every scheduled workflow can be re-run by hand and tells somebody when a scheduled run fails', () => {
  const scheduled = workflows.filter(([, parsed]) => parsed.on.schedule !== undefined);

  it('finds the scheduled workflows', () => {
    expect(scheduled.map(([name]) => name)).toContain('nightly-quality.yml');
  });

  it.each(scheduled.map(([name]) => name))('%s has a manual trigger and a job that reports a failure', (name) => {
    const parsed = workflow(name);
    expect(parsed.on).toHaveProperty('workflow_dispatch');
    const reporter = Object.entries(parsed.jobs).find(([, job]) => job.if?.includes("'failure'") && job.permissions?.issues === 'write');
    expect(reporter, `${name} has no job that opens an issue when a job fails`).toBeDefined();
    // it waits for every other job, or it could not see their failure
    expect([reporter![1].needs ?? []].flat().sort()).toEqual(Object.keys(parsed.jobs).filter((job) => job !== reporter![0]).sort());
  });
});
