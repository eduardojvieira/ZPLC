// AIX-011: an agent creates and replaces the files of the open project through MCP, checked first. workspace_check_write runs
// the validation and writes nothing; workspace_write writes only what validates, each file by a temporary file and a rename, and
// leaves the old bytes when it refuses. Every write stays inside the workspace (no link, no "..", no absolute path, only the
// surfaces of plan-aix §4.1), refuses a credential in zplc.json (IDE-030), and touches no device (AGENTS.md rule 8).
import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, open, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { LEARN_POLICY_FILENAME } from '../../shared/learnPolicyModel';
import { canonicalManifest } from '../ai/changeSetPrepare';
import { formatById, type FormatId } from '../formats';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { serializeVisualDocument } from '../models/visualFileFormat';
import { buildMcpServer, createMcpDispatcher, openMcpUserData, openMcpWorkspace, type McpWorkspace } from './server';
import { __workspaceWriteTestHooks } from './workspaceWrite';

const temporary: string[] = [];
afterEach(async () => {
  __workspaceWriteTestHooks.rename = undefined;
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const example = (id: FormatId, index = 0): Record<string, unknown> => structuredClone(formatById(id).examples[index]!.content);
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const MANIFEST = {
  schemaVersion: 2,
  name: 'MCP write',
  version: '1.0.0',
  target: { board: 'posix' },
  tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Belt.ld'] }],
};

/**
 * A project whose task runs the Ladder worked example, with the plain scenario that binds to it. `prepare` runs before the
 * workspace is opened: a change of an entry of the root changes the root's identity, which an open workspace refuses.
 */
async function project(prepare?: (root: string) => Promise<void>): Promise<{ root: string; workspace: McpWorkspace }> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-mcp-write-'));
  temporary.push(root);
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'zplc.json'), JSON.stringify(MANIFEST, null, 2));
  await writeFile(join(root, 'src', 'Belt.ld.json'), pretty(example('ld')));
  await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n');
  await writeFile(join(root, 'tests', 'belt.scenario.json'), pretty(example('scenario')));
  await prepare?.(root);
  const workspace = await openMcpWorkspace(root);
  expect(workspace).toBeDefined();
  return { root, workspace: workspace! };
}

type Call = (tool: 'workspace_check_write' | 'workspace_write' | 'project_inspect', args?: Record<string, unknown>) => Promise<Body>;
type Body = Record<string, unknown> & { isError: boolean };
function caller(workspace: McpWorkspace): Call {
  const dispatch = createMcpDispatcher(workspace);
  return async (tool, args = {}) => {
    const result = await dispatch(tool as never, args, new AbortController().signal);
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
    return { ...result.structuredContent, isError: result.isError === true };
  };
}

/** Every file under the root with the digest of its bytes: what "nothing changed" means. */
async function tree(root: string, folder = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, await tree(root, path));
    else out[path] = entry.isSymbolicLink() ? 'link' : sha256(await readFile(join(root, path)));
  }
  return out;
}

const ST = 'PROGRAM Extra\nVAR\n  a : BOOL;\nEND_VAR\na := NOT a;\nEND_PROGRAM\n';
const IL = 'PROGRAM Lamp\nVAR\n  a : BOOL;\n  q : BOOL;\nEND_VAR\n  LD a\n  ST q\nEND_PROGRAM\n';
const compact = (value: unknown) => JSON.stringify(value);

describe('workspace_check_write: the same check, nothing written (AIX-011)', () => {
  test('checks the five languages, zplc.json, a scenario and a scene, and leaves every byte of the project as it was', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    const late = { ...example('scenario'), id: 'belt-late' };
    const body = await call('workspace_check_write', {
      files: [
        { path: 'src/Extra.st', content: ST },
        { path: 'src/Lamp.il', content: IL },
        { path: 'src/Belt.ld.json', content: compact(example('ld')) },
        { path: 'src/Guard.fbd.json', content: compact(example('fbd')) },
        { path: 'src/Cycle.sfc.json', content: compact(example('sfc')) },
        { path: 'zplc.json', content: compact(MANIFEST) },
        { path: 'tests/late.scenario.json', content: compact(late) },
        { path: 'scene.json', content: compact(example('scene')) },
      ],
    });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    expect(body).toMatchObject({ ok: true, evidenceLevel: 'host-static', dryRun: true, loadable: true, compiled: true });
    const files = body.files as Array<Record<string, unknown>>;
    expect(files.map((file) => [file.path, file.action])).toEqual([
      ['src/Extra.st', 'create'],
      ['src/Lamp.il', 'create'],
      ['src/Belt.ld.json', 'replace'],
      ['src/Guard.fbd.json', 'create'],
      ['src/Cycle.sfc.json', 'create'],
      ['zplc.json', 'replace'],
      ['tests/late.scenario.json', 'create'],
      ['scene.json', 'create'],
    ]);
    expect(files.map((file) => file.language)).toEqual(['ST', 'IL', 'LD', 'FBD', 'SFC', undefined, undefined, undefined]);
    // the replaced files name the digest of what is on disk now
    expect(files[2]!.beforeSha256).toBe(sha256(await readFile(join(root, 'src/Belt.ld.json'))));
    expect(body.audit).toMatchObject({ permission: 'project:read' });
    expect(await tree(root)).toEqual(before);
  });

  test('a file that would not load is answered with its place and the accepted values, the same refusal as workspace_write', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const broken = example('ld') as { rungs: Array<{ grid: Array<Array<{ element: { type: string } | null }>> }> };
    broken.rungs[0]!.grid[0]![0]!.element!.type = 'contact';
    const before = await tree(root);
    const files = [{ path: 'src/Belt.ld.json', content: compact(broken) }];
    const checked = await call('workspace_check_write', { files });
    const written = await call('workspace_write', { files });
    for (const body of [checked, written]) {
      expect(body).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED', isError: true });
      const diagnostic = (body.diagnostics as Array<Record<string, unknown>>).find((item) => item.path === 'src/Belt.ld.json')!;
      expect(diagnostic.jsonPath).toBe('rungs[0].grid[0][0].element.type');
      expect(diagnostic.acceptedValues).toContain('contact_no');
      expect(body.nextStep).toContain('workspace_check_write');
    }
    expect(checked.diagnostics).toEqual(written.diagnostics);
    expect(await tree(root)).toEqual(before);
  });
});

describe('workspace_write writes what validates, in the stable form of the editors (AIX-011)', () => {
  test('creates a program in each of the five languages; LD, FBD and SFC in their byte-stable form, ST and IL as sent', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const body = await call('workspace_write', {
      files: [
        { path: 'src/Extra.st', content: ST },
        { path: 'src/Lamp.il', content: IL },
        { path: 'src/Ladder.ld.json', content: compact(example('ld')) },
        { path: 'src/Guard.fbd.json', content: compact(example('fbd')) },
        { path: 'src/Cycle.sfc.json', content: compact(example('sfc')) },
      ],
    });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    expect(body).toMatchObject({ ok: true, evidenceLevel: 'host-static' });
    expect(body.audit).toMatchObject({ permission: 'project:write' });
    expect(await readFile(join(root, 'src/Extra.st'), 'utf8')).toBe(ST);
    expect(await readFile(join(root, 'src/Lamp.il'), 'utf8')).toBe(IL);
    for (const [path, id] of [
      ['src/Ladder.ld.json', 'ld'],
      ['src/Guard.fbd.json', 'fbd'],
      ['src/Cycle.sfc.json', 'sfc'],
    ] as const) {
      const stored = await readFile(join(root, path), 'utf8');
      expect(stored, path).toBe(serializeVisualDocument(JSON.parse(stored)));
      expect(JSON.parse(stored), path).toMatchObject(example(id));
    }
    const written = body.written as Array<Record<string, unknown>>;
    expect(written.map((file) => file.canonicalized)).toEqual([false, false, true, true, true]);
    for (const file of written) expect(file.afterSha256, String(file.path)).toBe(sha256(await readFile(join(root, String(file.path)))));
  });

  test('replaces zplc.json as Studio writes it, and the project still opens for the read tools', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const changed = { ...MANIFEST, version: '1.1.0' };
    const body = await call('workspace_write', { files: [{ path: 'zplc.json', content: compact(changed) }] });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    const expected = canonicalManifest(changed);
    expect('content' in expected && (await readFile(join(root, 'zplc.json'), 'utf8')) === expected.content).toBe(true);
    const inspected = await call('project_inspect');
    expect(inspected.isError, JSON.stringify(inspected)).toBe(false);
    expect((inspected.summary as { version: string }).version).toBe('1.1.0');
  });

  test('creates a scenario, a scene and a plant map as two-space JSON with a final newline', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const late = { ...example('scenario'), id: 'belt-late' };
    const plant = await call('workspace_write', {
      files: [
        { path: 'scene.json', content: compact(example('scene')) },
        { path: 'plant-map.json', content: compact(example('plant-map')) },
      ],
    });
    expect(plant.isError, JSON.stringify(plant)).toBe(false);
    const scenarios = await call('workspace_write', {
      files: [
        { path: 'tests/late.scenario.json', content: compact(late) },
        { path: 'tests/scene.scenario.json', content: compact(example('scenario', 1)) },
      ],
    });
    expect(scenarios.isError, JSON.stringify(scenarios)).toBe(false);
    expect(await readFile(join(root, 'scene.json'), 'utf8')).toBe(pretty(example('scene')));
    expect(await readFile(join(root, 'plant-map.json'), 'utf8')).toBe(pretty(example('plant-map')));
    expect(await readFile(join(root, 'tests/late.scenario.json'), 'utf8')).toBe(pretty(late));
    expect(await readFile(join(root, 'tests/scene.scenario.json'), 'utf8')).toBe(pretty(example('scenario', 1)));
  });

  test('refuses the whole batch when one file does not validate: the valid file is not written either', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    const body = await call('workspace_write', {
      files: [
        { path: 'src/Extra.st', content: ST },
        { path: 'src/Cycle.sfc.json', content: '{"name": "Cycle"' },
      ],
    });
    expect(body).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED', isError: true });
    expect(await tree(root)).toEqual(before);
  });

  test('a scenario that names a variable the program does not have is refused with the reason, and is not written', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const wrong = { ...example('scenario'), id: 'belt-wrong', events: [{ atMs: 100, set: { 'Belt.Nope': true } }] };
    const body = await call('workspace_write', { files: [{ path: 'tests/wrong.scenario.json', content: compact(wrong) }] });
    expect(body).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED' });
    const diagnostics = body.diagnostics as Array<Record<string, unknown>>;
    expect(diagnostics.some((item) => item.path === 'tests/wrong.scenario.json')).toBe(true);
    await expect(access(join(root, 'tests/wrong.scenario.json'))).rejects.toThrow();
  });

  test('requireCompile refuses a program that does not compile; without it the write lands and the compiler says why', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const broken = 'PROGRAM Main\nVAR x : BOOL; END_VAR\nx := ;\nEND_PROGRAM\n';
    const manifest = { ...MANIFEST, tasks: [{ ...MANIFEST.tasks[0]!, programs: ['Main.st'] }] };
    const strict = await call('workspace_write', {
      files: [
        { path: 'src/Main.st', content: broken },
        { path: 'zplc.json', content: compact(manifest) },
      ],
      requireCompile: true,
    });
    expect(strict).toMatchObject({ ok: false, error: 'MCP_VALIDATION_FAILED' });
    expect(await readFile(join(root, 'src/Main.st'), 'utf8')).not.toBe(broken);
    const loose = await call('workspace_write', { files: [{ path: 'src/Main.st', content: broken }] });
    expect(loose.isError, JSON.stringify(loose)).toBe(false);
    expect(loose.compiled).toBe(false);
    expect((loose.compileDiagnostics as Array<{ path?: string }>).some((item) => item.path === 'src/Main.st')).toBe(true);
    expect(await readFile(join(root, 'src/Main.st'), 'utf8')).toBe(broken);
  });

  test('a stale expectedBaseSha256 is MCP_WORKSPACE_CHANGED and nothing is written', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    const body = await call('workspace_write', {
      files: [{ path: 'src/Main.st', content: ST }],
      expectedBaseSha256: { 'src/Main.st': 'a'.repeat(64) },
    });
    expect(body).toMatchObject({ ok: false, error: 'MCP_WORKSPACE_CHANGED' });
    expect(await tree(root)).toEqual(before);
    const fresh = await call('workspace_write', {
      files: [{ path: 'src/Main.st', content: ST }],
      expectedBaseSha256: { 'src/Main.st': before['src/Main.st']! },
    });
    expect(fresh.isError, JSON.stringify(fresh)).toBe(false);
  });
});

describe('a write stays inside the workspace (AIX-011, plan-aix §4.2)', () => {
  test('refuses "..", an absolute path, a drive, a backslash, and every path outside the allowed surfaces', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    for (const path of [
      '../evil.st',
      'src/../zplc.json',
      'src/./Main.st',
      '/etc/evil.st',
      join(root, 'src', 'Abs.st'),
      'C:/evil.st',
      'src\\Evil.st',
      'README.md',
      '.git/config',
      'boards.json',
      'src/sub/Deep.st',
      'src/.hidden.st',
      'tests/plain.json',
      'specs/note.st',
      'src/belt.ld.json',
    ]) {
      for (const tool of ['workspace_check_write', 'workspace_write'] as const) {
        const body = await call(tool, { files: [{ path, content: ST }] });
        expect(body.error, `${tool} ${path}`).toBe('MCP_PATH_FORBIDDEN');
        expect(String(body.nextStep)).toContain('src/');
      }
    }
    expect(await tree(root)).toEqual(before);
  });

  test('refuses a Windows device name and a stream name on every platform: COM1 is a serial port (rule 8)', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    const devices = ['src/COM1.st', 'src/com9.il', 'src/CON.st', 'src/nul.ld.json', 'src/Aux.st', 'tests/LPT1.scenario.json'];
    for (const path of [...devices, 'src/a.st:b.st']) {
      for (const tool of ['workspace_check_write', 'workspace_write'] as const) {
        const body = await call(tool, { files: [{ path, content: ST }] });
        expect(body.error, `${tool} ${path}`).toBe('MCP_PATH_FORBIDDEN');
      }
    }
    expect(await tree(root)).toEqual(before);
  });

  test('refuses a target that is a symbolic link, and the file it points to keeps its bytes', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'zplc-mcp-outside-'));
    temporary.push(outside);
    await writeFile(join(outside, 'secret.st'), 'outside');
    const { root, workspace } = await project((root) => symlink(join(outside, 'secret.st'), join(root, 'scene.json')));
    // a link in src after opening: the reader refuses a project with one, and an entry of src leaves the root's identity alone
    await symlink(join(outside, 'secret.st'), join(root, 'src', 'Link.st'));
    const call = caller(workspace);
    for (const path of ['src/Link.st', 'scene.json']) {
      const body = await call('workspace_write', {
        files: [{ path, content: path === 'scene.json' ? compact(example('scene')) : ST }],
      });
      expect(body.error, path).toBe('MCP_PATH_FORBIDDEN');
    }
    expect(await readFile(join(outside, 'secret.st'), 'utf8')).toBe('outside');
  });

  test('refuses a target under a symlinked folder, and writes nothing where the link leads', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'zplc-mcp-outside-'));
    temporary.push(outside);
    const { workspace } = await project(async (root) => {
      await rm(join(root, 'tests'), { recursive: true });
      await symlink(outside, join(root, 'tests'));
    });
    const call = caller(workspace);
    const body = await call('workspace_write', {
      files: [{ path: 'tests/late.scenario.json', content: compact({ ...example('scenario'), id: 'late' }) }],
    });
    expect(body.error).toBe('MCP_PATH_FORBIDDEN');
    expect(await readdir(outside)).toEqual([]);
  });

  test('refuses a credential in zplc.json with the field named and never its value (IDE-030)', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const before = await tree(root);
    const leaking = { ...MANIFEST, network: { wifi: { ssid: 'plant', password: 'hunter2-secret' } } };
    for (const tool of ['workspace_check_write', 'workspace_write'] as const) {
      const body = await call(tool, { files: [{ path: 'zplc.json', content: compact(leaking) }] });
      expect(body).toMatchObject({ ok: false, error: 'MCP_SENSITIVE_FIELD', isError: true });
      expect(body.validValues ?? body.fields).toBeDefined();
      expect(JSON.stringify(body)).toContain('network.wifi.password');
      expect(JSON.stringify(body)).not.toContain('hunter2-secret');
    }
    expect(await tree(root)).toEqual(before);
  });
});

describe('the commit protocol: a temporary file and a rename per file (plan-aix §4.3, Stage 3)', () => {
  test.skipIf(process.platform === 'win32')('a replaced file keeps its mode; a new file gets 0o666 minus the umask', async () => {
    const { root, workspace } = await project();
    await chmod(join(root, 'src/Main.st'), 0o644);
    await chmod(join(root, 'src/Belt.ld.json'), 0o640);
    const call = caller(workspace);
    const body = await call('workspace_write', {
      files: [
        { path: 'src/Main.st', content: ST },
        { path: 'src/Belt.ld.json', content: compact(example('ld')) },
        { path: 'src/Fresh.st', content: ST },
      ],
    });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    const mode = async (path: string) => (await stat(join(root, path))).mode & 0o7777;
    expect(await mode('src/Main.st')).toBe(0o644);
    expect(await mode('src/Belt.ld.json')).toBe(0o640);
    const mask = process.umask();
    expect(await mode('src/Fresh.st')).toBe(0o666 & ~mask);
  });

  test('replaces a program and a scenario in one batch: new bytes, no temporary file left, still writable', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const scenario = { ...example('scenario'), durationMs: 1500 };
    const body = await call('workspace_write', {
      files: [
        { path: 'src/Main.st', content: ST },
        { path: 'tests/belt.scenario.json', content: compact(scenario) },
      ],
    });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    expect(await readFile(join(root, 'src/Main.st'), 'utf8')).toBe(ST);
    expect(await readFile(join(root, 'tests/belt.scenario.json'), 'utf8')).toBe(pretty(scenario));
    for (const folder of ['', 'src', 'tests'])
      expect(
        (await readdir(join(root, folder))).filter((name) => name.endsWith('.tmp')),
        folder,
      ).toEqual([]);
    await access(join(root, 'src/Main.st'), constants.W_OK);
    await access(join(root, 'tests/belt.scenario.json'), constants.W_OK);
  });

  test('a target held open for reading is replaced, or the write fails cleanly with the old bytes', async () => {
    const { root, workspace } = await project();
    const call = caller(workspace);
    const old = await readFile(join(root, 'src/Main.st'), 'utf8');
    const handle = await open(join(root, 'src/Main.st'), 'r');
    let body: Body;
    try {
      body = await call('workspace_write', { files: [{ path: 'src/Main.st', content: ST }] });
    } finally {
      await handle.close();
    }
    if (body.isError) {
      expect(body.error).toBe('MCP_INTERNAL_ERROR');
      expect(await readFile(join(root, 'src/Main.st'), 'utf8')).toBe(old);
    } else expect(await readFile(join(root, 'src/Main.st'), 'utf8')).toBe(ST);
    expect((await readdir(join(root, 'src'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  test('a failure of the second rename of three restores the first file and its mode, and leaves the third untouched', async () => {
    const { root, workspace } = await project();
    if (process.platform !== 'win32') await chmod(join(root, 'src/Main.st'), 0o640);
    const before = await tree(root);
    const mainMode = (await stat(join(root, 'src/Main.st'))).mode & 0o7777;
    let renames = 0;
    __workspaceWriteTestHooks.rename = async () => {
      renames += 1;
      if (renames === 2) throw Object.assign(new Error('forced'), { code: 'EIO' });
    };
    const call = caller(workspace);
    const body = await call('workspace_write', {
      files: [
        { path: 'src/Main.st', content: ST },
        { path: 'src/Extra.st', content: ST },
        { path: 'tests/belt.scenario.json', content: compact({ ...example('scenario'), durationMs: 1500 }) },
      ],
    });
    expect(body).toMatchObject({ ok: false, error: 'MCP_INTERNAL_ERROR', isError: true });
    expect(await tree(root)).toEqual(before);
    expect((await stat(join(root, 'src/Main.st'))).mode & 0o7777).toBe(mainMode);
  });
});

describe('a lesson workspace with solutions hidden (D-32, AIX-002)', () => {
  const LESSON = LESSON_INDEX.lessons[0]!.id;
  async function lesson(policy: string | undefined, withUserData = true): Promise<{ root: string; workspace: McpWorkspace }> {
    const userData = await mkdtemp(join(tmpdir(), 'zplc-mcp-write-lesson-'));
    temporary.push(userData);
    const root = join(userData, 'learn-workspaces', LESSON);
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'zplc.json'), JSON.stringify({ ...MANIFEST, tasks: [{ ...MANIFEST.tasks[0]!, programs: ['Main.st'] }] }));
    await writeFile(join(root, 'src', 'Main.st'), 'PROGRAM Main\nVAR x : BOOL; END_VAR\nEND_PROGRAM\n');
    if (policy !== undefined) await writeFile(join(userData, LEARN_POLICY_FILENAME), policy);
    const workspace = await openMcpWorkspace(root);
    expect(workspace).toBeDefined();
    const data = withUserData ? await openMcpUserData(userData) : undefined;
    return { root, workspace: { ...workspace!, ...(data ? { userData: data } : {}) } };
  }

  test('workspace_write is refused while solutions are hidden, failing closed; workspace_check_write still checks', async () => {
    for (const [policy, withUserData] of [
      [JSON.stringify({ hideSolutions: true }), true],
      [undefined, true],
      ['{', true],
      [JSON.stringify({ hideSolutions: false }), false],
    ] as const) {
      const { root, workspace } = await lesson(policy, withUserData);
      const call = caller(workspace);
      const before = await tree(root);
      const body = await call('workspace_write', { files: [{ path: 'src/Main.st', content: ST }] });
      expect(body.error, String(policy)).toBe('MCP_SOLUTIONS_HIDDEN');
      expect(await tree(root)).toEqual(before);
      const checked = await call('workspace_check_write', { files: [{ path: 'src/Main.st', content: ST }] });
      expect(checked.isError, JSON.stringify(checked)).toBe(false);
    }
  });

  test('with hideSolutions false in --user-data the write lands', async () => {
    const { root, workspace } = await lesson(JSON.stringify({ hideSolutions: false }));
    const body = await caller(workspace)('workspace_write', { files: [{ path: 'src/Main.st', content: ST }] });
    expect(body.isError, JSON.stringify(body)).toBe(false);
    expect(await readFile(join(root, 'src/Main.st'), 'utf8')).toBe(ST);
  });
});

describe('the two tools touch no device (AGENTS.md rule 8) and the read tools answer as before', () => {
  async function registeredTools(workspace: McpWorkspace) {
    const tools: Array<{
      name: string;
      inputSchema: { safeParse: (value: unknown) => { success: boolean } };
      annotations: Record<string, unknown>;
    }> = [];
    const proto = McpServer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const registerTool = proto.registerTool;
    proto.registerTool = function (this: unknown, name: string, config: (typeof tools)[number], callback: unknown) {
      tools.push({ name, inputSchema: config.inputSchema, annotations: config.annotations });
      return registerTool.call(this, name, config, callback);
    } as never;
    try {
      buildMcpServer(workspace);
    } finally {
      proto.registerTool = registerTool;
    }
    return tools.filter((tool) => tool.name.startsWith('workspace_'));
  }

  test('each refuses a device, port or session argument, at the top and inside a file; only workspace_write is destructive', async () => {
    const { workspace } = await project();
    const tools = await registeredTools(workspace);
    expect(tools.map((tool) => tool.name)).toEqual(['workspace_check_write', 'workspace_write']);
    const file = { path: 'src/Main.st', content: ST };
    for (const tool of tools) {
      expect(tool.inputSchema.safeParse({ files: [file] }).success, tool.name).toBe(true);
      for (const extra of [
        'port',
        'serialPort',
        'device',
        'baud',
        'host',
        'address',
        'session',
        'studioSession',
        'deploy',
        'flash',
        'force',
        'command',
        'shell',
        'boardRun',
        'boardStop',
        'plantIo',
        'mirror',
      ]) {
        expect(tool.inputSchema.safeParse({ files: [file], [extra]: 'x' }).success, `${tool.name} took ${extra}`).toBe(false);
        expect(tool.inputSchema.safeParse({ files: [{ ...file, [extra]: 'x' }] }).success, `${tool.name} file took ${extra}`).toBe(false);
      }
      expect(tool.inputSchema.safeParse({ files: [] }).success).toBe(false);
      expect(
        tool.inputSchema.safeParse({ files: Array.from({ length: 9 }, (_, index) => ({ ...file, path: `src/F${index}.st` })) }).success,
      ).toBe(false);
    }
    expect(
      tools.map((tool) => [tool.name, tool.annotations.readOnlyHint, tool.annotations.destructiveHint, tool.annotations.openWorldHint]),
    ).toEqual([
      ['workspace_check_write', true, false, false],
      ['workspace_write', false, true, false],
    ]);
  });

  test('project_inspect answers the same summary and evidence before and after a check and a write of an unrelated file', async () => {
    const { workspace } = await project();
    const call = caller(workspace);
    const first = await call('project_inspect');
    await call('workspace_check_write', { files: [{ path: 'src/Extra.st', content: ST }] });
    const second = await call('project_inspect');
    await call('workspace_write', {
      files: [{ path: 'tests/late.scenario.json', content: compact({ ...example('scenario'), id: 'late' }) }],
    });
    const third = await call('project_inspect');
    for (const body of [second, third]) {
      expect(body.isError).toBe(false);
      expect(body.summary).toEqual(first.summary);
      expect(body.evidence).toEqual(first.evidence);
      expect(body.evidenceLevel).toBe(first.evidenceLevel);
    }
  });
});
