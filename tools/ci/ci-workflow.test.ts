// Structural checks on .github/workflows/ci.yml. The workflow is parsed as YAML,
// never matched as text. A hosted run is the only proof that GitHub honours it.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, string> };
type Workflow = {
  on: Record<string, { branches?: string[] } | null>;
  jobs: Record<string, { steps: Step[]; strategy?: { matrix: { include: Array<{ id: string; board: string }> } } }>;
};

const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as Workflow;

describe('ci.yml triggers', () => {
  it.each(['push', 'pull_request'])('runs on %s for the 2.0 branch and the default branches', (event) => {
    expect(workflow.on[event]?.branches).toEqual(expect.arrayContaining(['main', 'master', 'zplc-2.0-candidate']));
  });
});

describe('ci.yml cross-build artifacts', () => {
  const job = workflow.jobs['zephyr-cross-build']!;
  const boards = job.strategy!.matrix.include;
  const buildIndex = job.steps.findIndex((step) => step.run?.includes('west build'));
  const uploadIndex = job.steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
  const upload = job.steps[uploadIndex]!;
  const forBoard = (value: string, id: string) => value.replaceAll('${{ matrix.id }}', id).replaceAll('${{ runner.temp }}', '${RUNNER_TEMP}');

  it('builds every board of the matrix', () => {
    expect(boards.length).toBeGreaterThanOrEqual(6);
    expect(buildIndex).toBeGreaterThan(-1);
  });

  it('uploads after the build, pinned to a commit, and applies to every board', () => {
    expect(uploadIndex).toBeGreaterThan(buildIndex);
    expect(upload.uses).toMatch(/^actions\/upload-artifact@[0-9a-f]{40}$/);
    expect(upload.if).toBeUndefined();
  });

  it('names each board artifact differently and fails when a board produced no firmware', () => {
    const names = boards.map((board) => forBoard(upload.with!.name!, board.id));
    expect(new Set(names).size).toBe(boards.length);
    expect(upload.with!['if-no-files-found']).toBe('error');
  });

  it('uploads the firmware files from the directory that the build step writes to', () => {
    const buildDir = /-d "([^"]+)"/.exec(job.steps[buildIndex]!.run!)![1]!;
    for (const board of boards) {
      const paths = forBoard(upload.with!.path!, board.id).split('\n').map((line) => line.trim()).filter(Boolean);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) expect(path.startsWith(`${forBoard(buildDir, board.id)}/zephyr/`)).toBe(true);
    }
  });
});
