// Structural checks on .github/workflows/ci.yml. The workflow is parsed as YAML,
// never matched as text. A hosted run is the only proof that GitHub honours it.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CLANG_FORMAT_VERSION } from './format';

type Step = { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, string> };
type Workflow = {
  on: Record<string, { branches?: string[] } | null>;
  jobs: Record<string, { 'runs-on'?: string; steps: Step[]; strategy?: { matrix: { include: Array<{ id: string; board: string }> } } }>;
};

const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')) as Workflow;

describe('ci.yml triggers (VF-016)', () => {
  it.each(['push', 'pull_request'])('runs on %s for the 2.0 branch and the default branches', (event) => {
    expect(workflow.on[event]?.branches).toEqual(expect.arrayContaining(['main', 'master', 'zplc-2.0-candidate']));
  });
});

describe('ci.yml expected-failure check (VF-027)', () => {
  it.each(['test:compiler', 'test:ide'])('runs %s through the JUnit report and the expected-failure rule', (script) => {
    const step = workflow.jobs.typescript!.steps.find((candidate) => candidate.run?.includes(`bun run ${script}`));
    expect(step?.run).toContain('--reporter=junit');
    expect(step?.run).toContain('tools/ci/check-expected-failures.ts');
  });
});

describe('ci.yml type-check (VF-010, VF-011)', () => {
  const steps = workflow.jobs.typescript!.steps;
  const indexOf = (text: string) => steps.findIndex((step) => step.run?.includes(text));
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };

  it('runs the type-check of every TypeScript program once the compiler is built and before the IDE build', () => {
    const typecheck = steps.findIndex((step) => step.run?.trim() === 'bun run typecheck');
    expect(typecheck).toBeGreaterThan(-1);
    expect(typecheck).toBeGreaterThan(indexOf('bun run build:compiler'));
    expect(typecheck).toBeLessThan(indexOf('bun run build:ide'));
    expect(manifest.scripts.typecheck).toBe('bun tools/ci/typecheck.ts');
    expect(steps[typecheck]!.if).toBeUndefined();
  });

  it('lints the IDE in the job that builds it, through the package lint script', () => {
    const lint = steps.find((step) => step.run?.includes('bun run lint:ide'));
    expect(lint?.run).toContain('bun run build:ide');
    expect(manifest.scripts['lint:ide']).toBe('bun run --cwd=packages/zplc-ide lint');
  });
});

describe('ci.yml cross-build artifacts', () => {
  const job = workflow.jobs['zephyr-cross-build']!;
  const boards = job.strategy!.matrix.include;
  const buildIndex = job.steps.findIndex((step) => step.run?.includes('west build'));
  const uploadIndex = job.steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
  const upload = job.steps[uploadIndex]!;
  const forBoard = (value: string, id: string) =>
    value.replaceAll('${{ matrix.id }}', id).replaceAll('${{ runner.temp }}', '${RUNNER_TEMP}');

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
      const paths = forBoard(upload.with!.path!, board.id)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) expect(path.startsWith(`${forBoard(buildDir, board.id)}/zephyr/`)).toBe(true);
    }
  });
});

describe('the package manager cache is restored before the install', () => {
  type Job = { steps: Step[] };
  const nightly = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/nightly-quality.yml', import.meta.url), 'utf8')) as {
    jobs: Record<string, Job>;
  };
  const sites: Array<[string, Job]> = [
    ['ci.yml typescript', workflow.jobs.typescript!],
    ['ci.yml docs-and-truth', workflow.jobs['docs-and-truth']!],
    ['nightly desktop-platforms', nightly.jobs['desktop-platforms']!],
  ];

  it.each(sites)('%s restores the bun install cache under a key of bun.lock, then installs frozen', (_name, job) => {
    const install = job.steps.findIndex((step) => step.run?.includes('bun install'));
    const cache = job.steps.findIndex(
      (step) => step.uses?.startsWith('actions/cache@') && String(step.with?.path).includes('.bun/install/cache'),
    );
    expect(install).toBeGreaterThan(-1);
    expect(cache).toBeGreaterThan(-1);
    expect(cache).toBeLessThan(install);
    expect(job.steps[cache]!.uses).toMatch(/^actions\/cache@[0-9a-f]{40}$/);
    expect(String((job.steps[cache]!.with as Record<string, string>).key)).toContain("hashFiles('bun.lock')");
    expect(job.steps[install]!.run).toContain('--frozen-lockfile');
  });
});

describe('ci.yml clang-tidy jobs (VF-018)', () => {
  // the version that run_clang_tidy.py pins, as it tells a contributor whose clang-tidy is missing
  const pinned = /clang-tidy==(\d+\.\d+\.\d+)/.exec(
    Bun.spawnSync(['python3', '-B', 'tools/ci/run_clang_tidy.py', '--clang-tidy', '/nonexistent/clang-tidy'], {
      cwd: new URL('../../', import.meta.url).pathname,
      stderr: 'pipe',
    }).stderr.toString(),
  )?.[1];

  it.each(['host-core-sanitized', 'zephyr-cross-build'])(
    '%s installs the clang-tidy that run_clang_tidy.py pins, not the apt one',
    (id) => {
      expect(pinned).toBeDefined();
      const commands = workflow.jobs[id]!.steps.map((step) => step.run ?? '').join('\n');
      expect(commands).toContain(`pipx install clang-tidy==${pinned}`);
      expect(commands).not.toMatch(/apt-get install[^\n]*clang-tidy/);
    },
  );
});

describe('ci.yml documentation tooling (DOC-009)', () => {
  it('builds the native simulator before the typescript job tests the documentation tooling, and names it', () => {
    const steps = workflow.jobs.typescript!.steps;
    const build = steps.findIndex((step) => /zplc-native-sim-build/.test(step.run ?? '') && /--target zplc_runtime/.test(step.run ?? ''));
    const docs = steps.findIndex((step) => /bun test \.\/tools\/docs/.test(step.run ?? ''));
    expect(build).toBeGreaterThanOrEqual(0);
    expect(docs).toBeGreaterThan(build);
    expect(String(steps[docs]!.env?.ZPLC_NATIVE_SIM_BIN)).toContain('zplc-native-sim-build/zplc_runtime');
  });
});

describe('ci.yml formatting job (VF-017)', () => {
  const job = workflow.jobs.format;

  it('runs the format check on Linux with the clang-format that tools/ci/format.ts requires', () => {
    expect(job?.['runs-on']).toBe('ubuntu-latest');
    const commands = job!.steps.map((step) => step.run ?? '').join('\n');
    expect(commands).toContain(`pipx install clang-format==${CLANG_FORMAT_VERSION}`);
    expect(commands).toContain('bun install --frozen-lockfile');
    expect(commands).toContain('bun run format:check');
    expect(commands.indexOf('pipx install')).toBeLessThan(commands.indexOf('bun run format:check'));
  });

  it('runs on every push and pull request, because the workflow does', () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
  });
});
