// Structural checks on the triggers that the specification names (VF-016, REL-033). The workflows are parsed as YAML, never
// matched as text, and only what the requirement names is asserted: a hosted run is the only proof that GitHub honours it.
import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

type Job = {
  needs?: string | string[];
  if?: string;
  steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }>;
  permissions?: Record<string, string>;
};
type Workflow = {
  on: Record<string, { branches?: string[]; cron?: string }[] | { branches?: string[] } | null>;
  jobs: Record<string, Job>;
};

const folder = new URL('../../.github/workflows/', import.meta.url);
const workflows = readdirSync(folder)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => [name, Bun.YAML.parse(readFileSync(new URL(name, folder), 'utf8')) as Workflow] as const);
const workflow = (name: string) => workflows.find(([file]) => file === name)![1];

type Step = { name?: string; run?: string; uses?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type DeployJob = { outputs?: Record<string, string>; needs?: string | string[]; if?: string; steps: Step[]; permissions?: Record<string, string> };
type DeployWorkflow = {
  on: Record<string, { branches?: string[]; types?: string[]; inputs?: Record<string, { required?: boolean }> } | null>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, DeployJob>;
};

describe('PUB-005: the documentation site is published with the release, never by a push', () => {
  const docs = workflow('deploy-docs.yml') as unknown as DeployWorkflow;
  const jobs = docs.jobs;

  it('triggers: a published release, a dispatch that names a ref, and builds-only on pull requests', () => {
    expect(docs.on.release?.types).toEqual(['published']);
    expect(docs.on.workflow_dispatch?.inputs?.ref?.required).toBe(true);
    expect(docs.on.push?.branches).toEqual(['master']);
    expect(docs.on.pull_request?.branches).toEqual(expect.arrayContaining(['master', 'main', 'zplc-2.0-candidate']));
  });

  it('a push to master builds the site and never deploys it', () => {
    const condition = jobs.build!.if ?? '';
    expect(condition).not.toContain("github.event_name == 'push'"); // the build has no event filter that excludes a push
    expect(jobs.deploy!.if).not.toContain('push');
    expect(jobs.deploy!.if).toBe("github.event_name == 'release' || github.event_name == 'workflow_dispatch'");
    expect(docs.concurrency!.group).toContain('docs-build-');
  });

  it('skips the deploy, with a notice, when the released tag is not the highest stable release', () => {
    expect(jobs.guard!.if).toContain("github.event_name == 'release'");
    const run = jobs.guard!.steps.map((step) => step.run ?? '').join('\n');
    expect(run).toContain('--latest');
    expect(run).toContain('::notice::');
    expect(run).toContain('stale=true');
    expect(run).not.toContain('--limit 1');
    expect(jobs.guard!.outputs).toHaveProperty('stale');
    expect(jobs.build!.if).toContain("needs.guard.outputs.stale != 'true'");
  });

  it('deploys only on a published release or a dispatch, and never a prerelease', () => {
    expect(jobs.deploy!.if).toContain("github.event_name == 'release'");
    expect(jobs.deploy!.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(jobs.deploy!.if).not.toContain("'push'");
    expect(jobs.deploy!.if).not.toContain("'pull_request'");
    expect(jobs.build!.if).toContain('github.event.release.prerelease');
  });

  it('refuses a dispatch before any build: ancestor check and docs-only check run in a guard the build needs', () => {
    const guard = jobs.guard!;
    expect(guard.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(guard.steps.find((step) => step.uses?.startsWith('actions/checkout'))?.with?.['fetch-depth']).toBe(0);
    const run = guard.steps.map((step) => step.run ?? '').join('\n');
    expect(run).toContain('docs-dispatch-guard.ts');
    expect(run).toContain('--exclude-drafts');
    expect([jobs.build!.needs].flat()).toContain('guard');
    expect(jobs.build!.if).toContain('needs.guard.result');
    expect(guard.steps.some((step) => step.run?.includes('bun run build'))).toBe(false);
  });

  it('checks out the tag of the release, or the commit the guard accepted', () => {
    const ref = jobs.build!.steps.find((step) => step.uses?.startsWith('actions/checkout'))?.with?.ref as string;
    expect(ref).toContain('github.event.release.tag_name');
    expect(ref).toContain('needs.guard.outputs.sha');
  });

  it('has least-privilege permissions and a concurrency group that serialises every deploy', () => {
    expect(docs.permissions).toEqual({ contents: 'read' });
    expect(jobs.guard!.permissions ?? docs.permissions).toEqual({ contents: 'read' });
    expect(jobs.deploy!.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(docs.concurrency!['cancel-in-progress']).toBe(false);
    expect(docs.concurrency!.group).toContain("'pages'");
    // a build on a pull request must not share the group, or it could replace a pending deploy
    expect(docs.concurrency!.group).toContain('github.ref');
  });

  it('names the release to the build, so that the site shows its version', () => {
    const steps = jobs.build!.steps;
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
    expect([reporter![1].needs ?? []].flat().sort()).toEqual(
      Object.keys(parsed.jobs)
        .filter((job) => job !== reporter![0])
        .sort(),
    );
  });
});
