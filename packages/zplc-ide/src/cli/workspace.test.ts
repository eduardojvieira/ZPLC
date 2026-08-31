import { mkdir, mkdtemp, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { readWorkspace, readWorkspaceScenarios, __workspaceReadTestHooks } from './workspace';

const manifest = JSON.stringify({ name: 'test', version: '1.0.0', tasks: [{ name: 'Main', file: 'Main.st' }] });
async function workspace(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'zplc-cli-')); await mkdir(join(root, 'src')); await writeFile(join(root, 'zplc.json'), manifest); await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM'); return root; }
async function checked(run: (root: string) => Promise<void>, expected: string) { const root = await workspace(); try { await run(root); await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: expected }] }); } finally { await rm(root, { recursive: true, force: true }); } }

describe('readWorkspace', () => {
  it('reads and migrates the small project layout', async () => { const root = await workspace(); try { await expect(readWorkspace(root)).resolves.toMatchObject({ ok: true, workspace: { project: { schemaVersion: 2 }, sourceSchemaVersion: 1, sources: [{ name: 'Main.st', path: 'src/Main.st', language: 'ST' }] } }); } finally { await rm(root, { recursive: true, force: true }); } });
  it('keeps exact manifest bytes internal to the workspace result', async () => {
    const root = await workspace();
    try {
      const result = await readWorkspace(root);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workspace.manifestBytes).toEqual(new TextEncoder().encode(manifest));
      expect(JSON.stringify(result)).not.toContain('manifestBytes');
      expect(JSON.stringify(result)).not.toContain('"0":123');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('reads exact source bytes internally', async () => {
    const root = await workspace();
    try {
      const result = await readWorkspace(root);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.workspace.sources[0]?.bytes).toEqual(new TextEncoder().encode('PROGRAM Main\nEND_PROGRAM'));
      expect(JSON.stringify(result)).not.toContain('bytes');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('rejects unavailable roots and every link boundary without exposing targets', async () => {
    await expect(readWorkspace(join(tmpdir(), 'missing-zplc-cli'))).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_MISSING' }] });
    await checked(async root => { await rm(join(root, 'src'), { recursive: true }); }, 'WORKSPACE_MISSING');
    await checked(async root => { const target = join(root, 'target.st'); await writeFile(target, 'PROGRAM Main\nEND_PROGRAM'); await rm(join(root, 'zplc.json')); await symlink(target, join(root, 'zplc.json'), 'file'); }, 'WORKSPACE_SYMLINK');
    await checked(async root => { const target = join(root, 'target-src'); await mkdir(target); await rm(join(root, 'src'), { recursive: true }); await symlink(target, join(root, 'src'), process.platform === 'win32' ? 'junction' : 'dir'); }, 'WORKSPACE_INVALID_DIRECTORY');
    await checked(async root => { const target = join(root, 'target.st'); await writeFile(target, 'PROGRAM Main\nEND_PROGRAM'); await symlink(target, join(root, 'src', 'outside.st'), 'file'); }, 'WORKSPACE_SYMLINK');
    const target = await workspace(); const link = `${target}-link`;
    try { await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); await expect(readWorkspace(link)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_INVALID' }] }); }
    finally { await rm(link, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }); }
  });
  it('enforces manifest and source limits after reads as well as metadata', async () => {
    await checked(async root => { await writeFile(join(root, 'zplc.json'), ' '.repeat(128 * 1024 + 1)); }, 'WORKSPACE_LIMIT');
    await checked(async root => { await writeFile(join(root, 'src', 'large.st'), 'x'.repeat(256 * 1024 + 1)); }, 'WORKSPACE_LIMIT');
    await checked(async root => { for (let index = 0; index < 128; index++) await writeFile(join(root, 'src', `extra${index}.st`), 'PROGRAM Main\nEND_PROGRAM'); }, 'WORKSPACE_LIMIT');
    await checked(async root => { for (let index = 0; index < 9; index++) await writeFile(join(root, 'src', `large${index}.st`), 'x'.repeat(256 * 1024)); }, 'WORKSPACE_LIMIT');
  });
  it('keeps diagnostics relative and content-free for invalid manifests and duplicate names', async () => {
    await checked(async root => { await writeFile(join(root, 'zplc.json'), JSON.stringify({ password: 'super-secret-value' })); }, 'PROJECT_INVALID');
    const root = await workspace();
    try { await writeFile(join(root, 'src', 'main.ST'), 'PROGRAM Main\nEND_PROGRAM'); const result = await readWorkspace(root); expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_DUPLICATE_SOURCE' }] }); expect(JSON.stringify(result)).not.toContain(root); } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('uses ordinal source ordering with case-insensitive language recognition', async () => {
    const root = await workspace();
    try {
      await rm(join(root, 'src', 'Main.st'));
      await writeFile(join(root, 'src', 'zeta.ST'), 'PROGRAM Zeta\nEND_PROGRAM');
      await writeFile(join(root, 'src', 'Alpha.IL'), 'PROGRAM Alpha\nEND_PROGRAM');
      const result = await readWorkspace(root);
      expect(result).toMatchObject({ ok: true, workspace: { sources: [{ name: 'Alpha.IL', language: 'IL' }, { name: 'zeta.ST', language: 'ST' }] } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('fails closed when a manifest or source pathname is replaced after lstat', async () => {
    const root = await workspace();
    try {
      const manifestPath = join(root, 'zplc.json'); const replacementManifest = join(root, 'replacement.json');
      await writeFile(replacementManifest, JSON.stringify({ name: 'replacement', version: '1.0.0', tasks: [] }));
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === manifestPath) { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(manifestPath); await rename(replacementManifest, manifestPath); }
      };
      await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'zplc.json' }] });

      await writeFile(manifestPath, manifest); const sourcePath = join(root, 'src', 'Main.st'); const replacementSource = join(root, 'replacement.st');
      await writeFile(replacementSource, 'PROGRAM Replacement\nEND_PROGRAM');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === sourcePath) { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(sourcePath); await rename(replacementSource, sourcePath); }
      };
      await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'src/Main.st' }] });
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });
  it('fails closed when the source directory is replaced after a file lstat', async () => {
    const root = await workspace();
    try {
      const sourcePath = join(root, 'src', 'Main.st'); const sourceDirectory = join(root, 'src');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === sourcePath) {
          __workspaceReadTestHooks.afterFileLstat = undefined;
          await rename(sourceDirectory, join(root, 'src-original')); await mkdir(sourceDirectory); await writeFile(sourcePath, 'PROGRAM Replacement\nEND_PROGRAM');
        }
      };
      await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'src/Main.st' }] });
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });
  it('fails closed when a same-size source is overwritten after lstat', async () => {
    const root = await workspace();
    try {
      const sourcePath = join(root, 'src', 'Main.st');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === sourcePath) { __workspaceReadTestHooks.afterFileLstat = undefined; await writeFile(sourcePath, 'PROGRAM Evil\nEND_PROGRAM'); }
      };
      await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'src/Main.st' }] });
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });
  it('rejects a hybrid manifest/source snapshot', async () => {
    const root = await workspace();
    try {
      const manifestPath = join(root, 'zplc.json'); const laterSource = join(root, 'src', 'Next.st');
      await writeFile(laterSource, 'PROGRAM Next\nEND_PROGRAM');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === laterSource) { __workspaceReadTestHooks.afterFileLstat = undefined; await writeFile(manifestPath, JSON.stringify({ name: 'changed', version: '1.0.0', tasks: [{ name: 'Main', file: 'Main.st' }] })); }
      };
      await expect(readWorkspace(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED' }] });
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });
});

describe('readWorkspaceScenarios', () => {
  async function scenarios(root: string) { await mkdir(join(root, 'tests')); }
  async function scenario(root: string, name: string, input: string) { await writeFile(join(root, 'tests', name), input); }
  async function scenarioFailure(run: (root: string) => Promise<void>, expected: string) { const root = await workspace(); try { await run(root); await expect(readWorkspaceScenarios(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: expected }] }); } finally { await rm(root, { recursive: true, force: true }); } }

  it('reads direct JSON scenarios in ordinal order without compiling their raw input', async () => {
    const root = await workspace();
    try {
      await scenarios(root);
      await scenario(root, 'zeta.SCENARIO.JSON', '{"id":"zeta","extra":{"kept":true}}');
      await scenario(root, 'Alpha.scenario.json', '["raw", 1]');
      const result = await readWorkspaceScenarios(root);
      expect(result).toEqual({ ok: true, scenarios: [
        { path: 'tests/Alpha.scenario.json', input: ['raw', 1] },
        { path: 'tests/zeta.SCENARIO.JSON', input: { id: 'zeta', extra: { kept: true } } },
      ] });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects missing or linked test directories and every direct link entry', async () => {
    await scenarioFailure(async () => {}, 'WORKSPACE_MISSING');
    await scenarioFailure(async root => { const target = join(root, 'target-tests'); await mkdir(target); await symlink(target, join(root, 'tests'), process.platform === 'win32' ? 'junction' : 'dir'); }, 'WORKSPACE_INVALID_DIRECTORY');
    await scenarioFailure(async root => { await scenarios(root); await scenario(root, 'ok.scenario.json', '{}'); await symlink(join(root, 'zplc.json'), join(root, 'tests', 'link.txt'), 'file'); }, 'WORKSPACE_SYMLINK');
  });

  it('does not recurse and rejects an empty set or a matching directory', async () => {
    await scenarioFailure(async root => { await scenarios(root); await mkdir(join(root, 'tests', 'nested')); await writeFile(join(root, 'tests', 'nested', 'hidden.scenario.json'), '{}'); }, 'TEST_SCENARIOS_MISSING');
    await scenarioFailure(async root => { await scenarios(root); await mkdir(join(root, 'tests', 'folder.scenario.json')); }, 'WORKSPACE_INVALID_FILE');
  });

  it('keeps invalid JSON diagnostics relative and content-free', async () => {
    const root = await workspace();
    try {
      await scenarios(root); await scenario(root, 'secret.scenario.json', '{ "token": "do-not-leak"');
      const result = await readWorkspaceScenarios(root);
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'TEST_SCENARIO_INVALID', path: 'tests/secret.scenario.json' }] });
      expect(JSON.stringify(result)).not.toContain(root);
      expect(JSON.stringify(result)).not.toContain('do-not-leak');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('enforces scenario file, aggregate, and count limits', async () => {
    await scenarioFailure(async root => { await scenarios(root); await scenario(root, 'large.scenario.json', ' '.repeat(128 * 1024 + 1)); }, 'WORKSPACE_LIMIT');
    await scenarioFailure(async root => { await scenarios(root); for (let index = 0; index < 65; index++) await scenario(root, `${index}.scenario.json`, '{}'); }, 'WORKSPACE_LIMIT');
    await scenarioFailure(async root => { await scenarios(root); const maximum = JSON.stringify('x'.repeat(128 * 1024 - 2)); for (let index = 0; index < 5; index++) await scenario(root, `${index}.scenario.json`, maximum); }, 'WORKSPACE_LIMIT');
  });

  it('fails closed when a scenario pathname or tests directory is replaced after lstat', async () => {
    const root = await workspace();
    try {
      await scenarios(root); const scenarioPath = join(root, 'tests', 'motor.scenario.json'); const replacement = join(root, 'replacement.scenario.json');
      await scenario(root, 'motor.scenario.json', '{"id":"original"}'); await writeFile(replacement, '{"id":"replacement"}');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === scenarioPath) { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(scenarioPath); await rename(replacement, scenarioPath); }
      };
      await expect(readWorkspaceScenarios(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'tests/motor.scenario.json' }] });

      await scenario(root, 'motor.scenario.json', '{"id":"original"}'); const testsDirectory = join(root, 'tests');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === scenarioPath) {
          __workspaceReadTestHooks.afterFileLstat = undefined;
          await rename(testsDirectory, join(root, 'tests-original')); await mkdir(testsDirectory); await scenario(root, 'motor.scenario.json', '{"id":"replacement"}');
        }
      };
      await expect(readWorkspaceScenarios(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'tests/motor.scenario.json' }] });
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });
  it('rejects a hybrid scenario snapshot and keeps POSIX opens nonblocking', async () => {
    const root = await workspace();
    try {
      await scenarios(root); const first = join(root, 'tests', 'Alpha.scenario.json'); const later = join(root, 'tests', 'Zeta.scenario.json');
      await scenario(root, 'Alpha.scenario.json', '{"id":"alpha"}'); await scenario(root, 'Zeta.scenario.json', '{"id":"zeta"}');
      __workspaceReadTestHooks.afterFileLstat = async path => {
        if (path === later) { __workspaceReadTestHooks.afterFileLstat = undefined; await writeFile(first, '{"id":"other"}'); }
      };
      await expect(readWorkspaceScenarios(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_READ_FAILED', path: 'tests' }] });
      if (process.platform !== 'win32') expect(await Bun.file(join(import.meta.dir, 'workspace.ts')).text()).toContain('constants.O_NOFOLLOW | constants.O_NONBLOCK');
    } finally { __workspaceReadTestHooks.afterFileLstat = undefined; await rm(root, { recursive: true, force: true }); }
  });

  it('rejects case-insensitive duplicate scenario filenames where the filesystem supports them', async () => {
    const root = await workspace();
    try {
      await scenarios(root); await scenario(root, 'same.scenario.json', '{}'); await scenario(root, 'SAME.SCENARIO.JSON', '{}');
      const names = await readdir(join(root, 'tests'));
      if (names.length === 2) await expect(readWorkspaceScenarios(root)).resolves.toMatchObject({ ok: false, diagnostics: [{ code: 'WORKSPACE_DUPLICATE_SCENARIO' }] });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
