/**
 * workspace_check_write and workspace_write (AIX-011, plan-aix §4): an agent creates or replaces up to eight files of the open
 * project. Both run the same check; the check writes nothing, the write commits only a batch that passes it.
 *
 * - Only the surfaces of §4.1: a program of `src` in one of the five languages, `zplc.json`, a scenario of `tests`, `scene.json`
 *   and `plant-map.json`. No absolute path, no `..`, no link (a linked target or a linked folder on the way), nothing outside
 *   the real root. No file is deleted or renamed.
 * - A credential in `zplc.json` is refused by name, never echoed (IDE-030).
 * - Each file is validated as Studio loads it, then the merged project is checked on an isolated copy in the temporary folder:
 *   the project loads, the program compiles (advisory unless `requireCompile`), a new scenario binds to the program.
 * - LD, FBD and SFC are stored in the editors' byte-stable form, the manifest as Studio writes it, the other JSON files as
 *   two-space JSON with a final newline; ST and IL as sent.
 * - Each file is written to `.<name>.<12 hex>.tmp` beside it and renamed over it, so a reader sees the old bytes or the new
 *   ones. A batch is not atomic as a set: when a rename fails, the files already renamed are put back from memory, at best
 *   effort, and the answer names any it could not put back.
 * - In a lesson workspace whose solutions are hidden (D-32, read with the shared fail-closed reader) the write is refused.
 *
 * It opens no device, port, socket or process (AGENTS.md rule 8).
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { candidateLanguageOf, isCandidateSourcePath } from '../ai/candidatePaths';
import { canonicalManifest } from '../ai/changeSetPrepare';
import { manifestSensitivePaths } from '../ai/manifestPrivacy';
import { directoryIdentity, sameDirectoryIdentity, type DirectoryIdentity } from '../cli/firmwareBuildRunner';
import { compilerCheck, projectValidate, scenariosCheck, visualFileDiagnostics } from '../cli/toolApi';
import { readWorkspace, readWorkspaceProjectFile, readWorkspaceScenarios, type ToolDiagnostic } from '../cli/workspace';
import { parseScenarioFile } from '../learn/lessonPackage';
import { collectProjectBlocks } from '../models/projectBlocks';
import { serializeVisualDocument } from '../models/visualFileFormat';
import { loadFBDFile, loadLDFile, loadSFCFile } from '../models/visualFileLoad';
import '../plant/core/plantCore'; // registers the shipped parts in the catalogue
import { catalogue } from '../plant/core/catalogue';
import { parseScene, validateScene } from '../plant/core/scene';
import { validatePlantMap } from '../plants/plantMap';
import { workspaceLesson } from './resources';
import { logicalPath } from './resultSchemas';
import type { McpWorkspace } from './server';

export interface WorkspaceWriteArgs {
  files: Array<{ path: string; content: string }>;
  compileCheck?: boolean;
  requireCompile?: boolean;
  expectedBaseSha256?: Record<string, string>;
}

/** @internal Test seam: runs before each rename of a commit; a throw is a failed rename. */
export const __workspaceWriteTestHooks: { rename?: (from: string, to: string) => Promise<void> } = {};

type Kind = 'ST' | 'IL' | 'LD' | 'FBD' | 'SFC' | 'manifest' | 'scenario' | 'scene' | 'plant-map';
type Body = Record<string, unknown>;
const KIB = 1024;
const MAX_DIAGNOSTICS = 64;
const SURFACES = [
  'src/<name>.st',
  'src/<name>.il',
  'src/<name>.ld.json',
  'src/<name>.fbd.json',
  'src/<name>.sfc.json',
  'zplc.json',
  'tests/<name>.scenario.json',
  'scene.json',
  'plant-map.json',
];
const PATH_NEXT_STEP =
  'Use a relative path inside src/ (a .st, .il, .ld.json, .fbd.json or .sfc.json program), tests/ (a .scenario.json file), ' +
  'or the root files zplc.json, scene.json and plant-map.json; see validValues. Delete or rename files in Studio or on disk.';
const FIX_NEXT_STEP = 'Fix each diagnostic (it names the file, the place and the accepted values) and re-check with workspace_check_write.';

/** The kind and size limit of an allowed path (plan-aix §4.1), undefined for any other path. */
function surface(path: string): { kind: Kind; maxBytes: number } | undefined {
  if (!logicalPath(path) || /[\r\n]/.test(path) || basename(path).startsWith('.')) return undefined;
  if (path === 'zplc.json') return { kind: 'manifest', maxBytes: 128 * KIB };
  if (path === 'scene.json') return { kind: 'scene', maxBytes: 512 * KIB };
  if (path === 'plant-map.json') return { kind: 'plant-map', maxBytes: 128 * KIB };
  if (/^tests\/[^/]+\.scenario\.json$/.test(path)) return { kind: 'scenario', maxBytes: 128 * KIB };
  const language = isCandidateSourcePath(path) ? candidateLanguageOf(path) : undefined;
  return language ? { kind: language, maxBytes: 256 * KIB } : undefined;
}

/** The name the build reads a program under: case does not tell two programs apart, and main.ld is main.ld.json. */
const sourceNameKey = (name: string): string => name.toLowerCase().replace(/\.(ld|fbd|sfc)$/, '$&.json');
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sameRoot = (left: DirectoryIdentity, right: DirectoryIdentity | undefined) =>
  !!right && left.path === right.path && left.dev === right.dev && left.ino === right.ino;

interface Target {
  path: string;
  kind: Kind;
  content: string;
  /** What is written: the canonical form, or the content as sent. */
  final: string;
  absolute: string;
  folder: string;
  folderMissing: boolean;
  before?: { bytes: Buffer; mode: number };
}

/**
 * Where a path lands inside the real root, without following a link: every folder on the way is a real folder whose real path
 * is that path, and the target is absent or a regular unlinked file. A cause in plain words when it is not.
 */
async function locate(root: string, path: string): Promise<Omit<Target, 'kind' | 'content' | 'final'> | { cause: string }> {
  const segments = path.split('/');
  let folder = root;
  let folderMissing = false;
  for (const part of segments.slice(0, -1)) {
    folder = join(folder, part);
    try {
      const status = await lstat(folder);
      if (status.isSymbolicLink() || !status.isDirectory() || (await realpath(folder)) !== folder)
        return { cause: `${path}: ${part} is a symbolic link or not a real folder inside the workspace` };
    } catch {
      folderMissing = true;
    }
  }
  const absolute = join(folder, segments.at(-1)!);
  try {
    const status = await lstat(absolute);
    if (status.isSymbolicLink()) return { cause: `${path} is a symbolic link` };
    if (!status.isFile()) return { cause: `${path} is not a regular file` };
    return { path, absolute, folder, folderMissing, before: { bytes: await readFile(absolute), mode: Number(status.mode) & 0o7777 } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { cause: `${path} cannot be read` };
    return { path, absolute, folder, folderMissing };
  }
}

const refusal = (error: string, message: string, cause: string, nextStep: string, extra: Body = {}): Body => ({
  ok: false,
  error,
  message,
  cause,
  nextStep,
  ...extra,
});
const invalid = (diagnostics: readonly ToolDiagnostic[]): Body =>
  refusal(
    'MCP_VALIDATION_FAILED',
    'A proposed file does not pass the check; nothing was written.',
    diagnostics
      .map((item) => `${item.path ?? 'project'}: ${item.message}`)
      .join('; ')
      .slice(0, 512),
    FIX_NEXT_STEP,
    { diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS) },
  );

/** The checks of one file that need no other file; its canonical form for the JSON files the editors do not own. */
function checkAlone(path: string, kind: Kind, content: string, maxBytes: number): { final: string } | { diagnostics: ToolDiagnostic[] } {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > maxBytes)
    return { diagnostics: [{ code: 'FILE_TOO_LARGE', path, message: `The file is ${bytes} bytes; the limit is ${maxBytes}` }] };
  if (/\p{Cs}/u.test(content) || content.includes('\0'))
    return { diagnostics: [{ code: 'FILE_NOT_TEXT', path, message: 'The file must be UTF-8 text without NUL characters' }] };
  if (kind === 'ST' || kind === 'IL' || kind === 'LD' || kind === 'FBD' || kind === 'SFC') return { final: content };
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return { diagnostics: [{ code: 'FILE_NOT_JSON', path, message: 'The file is not valid JSON' }] };
  }
  const problems = (code: string, messages: string[]) => ({ diagnostics: messages.map((message) => ({ code, path, message })) });
  if (kind === 'manifest') {
    const manifest = canonicalManifest(value);
    return 'violations' in manifest ? problems('PROJECT_INVALID', manifest.violations) : { final: manifest.content };
  }
  if (kind === 'scenario') {
    const { problems: found } = parseScenarioFile(value);
    return found.length > 0 ? problems('TEST_SCENARIO_INVALID', found) : { final: pretty(value) };
  }
  if (kind === 'scene') {
    const parsed = parseScene(content);
    const found = 'problems' in parsed ? parsed.problems : validateScene(parsed.scene, catalogue);
    if (found.length > 0)
      return {
        diagnostics: found.map((problem) => ({
          code: 'SCENE_INVALID',
          path,
          jsonPath: problem.path,
          message: `${problem.path}: ${problem.message}`,
        })),
      };
    return { final: pretty(value) };
  }
  const found = validatePlantMap(value);
  return found.length > 0 ? problems('SCENE_MAP_INVALID', found) : { final: pretty(value) };
}

/** The bytes a visual file is stored in: what its editor writes after loading it as Studio opens it. */
function canonicalVisual(target: Target, blocks: ReturnType<typeof collectProjectBlocks>): string {
  const loaded =
    target.kind === 'LD'
      ? loadLDFile(target.path, target.content)
      : target.kind === 'FBD'
        ? loadFBDFile(target.path, target.content, blocks)
        : loadSFCFile(target.path, target.content);
  return loaded.ok ? serializeVisualDocument(loaded.model) : target.content;
}

/** The project as it would be after the batch, in a fresh folder of the temporary directory. */
async function materialize(root: string, targets: readonly Target[]): Promise<{ copy: string } | { body: Body }> {
  const loaded = await readWorkspace(root);
  if (!loaded.ok)
    return {
      body: refusal(
        'MCP_WORKSPACE_UNREADABLE',
        'The project cannot be read.',
        'The workspace reader refused it.',
        'Fix the project in Studio.',
        {
          diagnostics: loaded.diagnostics.slice(0, MAX_DIAGNOSTICS),
        },
      ),
    };
  const scenarios = await readWorkspaceScenarios(root);
  const files = new Map<string, Uint8Array | string>([['zplc.json', loaded.workspace.manifestBytes]]);
  for (const source of loaded.workspace.sources) files.set(source.path, source.bytes);
  if (scenarios.ok) for (const scenario of scenarios.scenarios) files.set(scenario.path, scenario.bytes);
  for (const name of ['scene.json', 'plant-map.json']) {
    const read = await readWorkspaceProjectFile(root, name, 512 * KIB);
    if (read.ok) files.set(name, read.bytes);
  }
  for (const target of targets) files.set(target.path, target.final);
  const copy = await mkdtemp(join(tmpdir(), 'zplc-mcp-write-check-'));
  await mkdir(join(copy, 'src'), { mode: 0o700 });
  await mkdir(join(copy, 'tests'), { mode: 0o700 });
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(copy, path)), { recursive: true, mode: 0o700 });
    await writeFile(join(copy, path), bytes, { mode: 0o600 });
  }
  return { copy };
}

/** The checks that need the whole project, on the isolated copy; visual files get their canonical form on the way. */
async function checkTogether(
  workspace: McpWorkspace,
  targets: Target[],
  compile: boolean,
  requireCompile: boolean,
): Promise<Body | { compiled?: boolean; compileDiagnostics: ToolDiagnostic[] }> {
  const made = await materialize(workspace.root, targets);
  if ('body' in made) return made.body;
  const { copy } = made;
  try {
    const paths = new Set(targets.map((target) => target.path));
    const manifestInBatch = paths.has('zplc.json');
    const loaded = await readWorkspace(copy);
    if (!loaded.ok) return invalid(loaded.diagnostics);
    const existing = new Set(loaded.workspace.sources.map((source) => source.path).filter((path) => !paths.has(path)));
    // a diagnostic of a file of the batch counts; one of the manifest or the tasks counts when the batch changes zplc.json
    const relevant = (item: ToolDiagnostic) =>
      (item.path !== undefined && paths.has(item.path)) || (manifestInBatch && !existing.has(item.path ?? ''));
    const visual = visualFileDiagnostics(loaded.workspace).filter((item) => item.path !== undefined && paths.has(item.path));
    if (visual.length > 0) return invalid(visual);
    const blocks = collectProjectBlocks(loaded.workspace.sources);
    for (const target of targets.filter((item) => item.kind === 'LD' || item.kind === 'FBD' || item.kind === 'SFC')) {
      target.final = canonicalVisual(target, blocks);
      await writeFile(join(copy, target.path), target.final);
    }
    const validated = await projectValidate(copy);
    const structural = validated.ok ? [] : validated.evidence.diagnostics.filter(relevant);
    if (structural.length > 0) return invalid(structural);
    if (!compile) return { compileDiagnostics: [] };
    const checked = await compilerCheck(copy);
    const compileDiagnostics = checked.evidence.diagnostics.slice(0, MAX_DIAGNOSTICS);
    if (requireCompile && !checked.ok) return invalid(compileDiagnostics);
    const scenarioPaths = targets.filter((target) => target.kind === 'scenario').map((target) => target.path);
    if (checked.ok && scenarioPaths.length > 0) {
      const bound = await scenariosCheck(copy, scenarioPaths);
      if (bound.length > 0) return invalid(bound);
    }
    return { compiled: checked.ok, compileDiagnostics };
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

/** Writes each target beside itself and renames it over; puts back what was renamed when a rename fails. */
async function commit(workspace: McpWorkspace, targets: readonly Target[]): Promise<Body | undefined> {
  const mask = process.umask();
  const temporaries: Array<{ target: Target; temporary: string }> = [];
  const renamed: Target[] = [];
  const writeBeside = async (target: Target, bytes: Uint8Array | string, mode: number) => {
    const temporary = join(target.folder, `.${basename(target.absolute)}.${randomBytes(6).toString('hex')}.tmp`);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.chmod(mode);
    } finally {
      await handle.close();
    }
    return temporary;
  };
  try {
    for (const target of targets) {
      if (target.folderMissing)
        await mkdir(target.folder).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        });
      temporaries.push({ target, temporary: await writeBeside(target, target.final, target.before?.mode ?? 0o666 & ~mask) });
    }
    // no link swapped in since the check: the root, every folder on the way and every target are still what they were
    if (!sameRoot(workspace.identity, await directoryIdentity(workspace.root))) throw new Error('workspace changed');
    for (const target of targets) {
      const again = await locate(workspace.root, target.path);
      if ('cause' in again || !again.before !== !target.before || again.folderMissing) throw new Error('target changed');
    }
    for (const { target, temporary } of temporaries) {
      await __workspaceWriteTestHooks.rename?.(temporary, target.absolute);
      await rename(temporary, target.absolute);
      renamed.push(target);
    }
    return undefined;
  } catch (error) {
    await Promise.all(
      temporaries.filter(({ target }) => !renamed.includes(target)).map(({ temporary }) => unlink(temporary).catch(() => undefined)),
    );
    const lost: string[] = [];
    for (const target of renamed) {
      try {
        if (!target.before) await unlink(target.absolute);
        else await rename(await writeBeside(target, target.before.bytes, target.before.mode), target.absolute);
      } catch {
        lost.push(target.path);
      }
    }
    const reason = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
    return refusal(
      'MCP_INTERNAL_ERROR',
      'The write failed; the files already written were put back.',
      lost.length > 0 ? `Write failed (${reason}); these files could not be put back: ${lost.join(', ')}.` : `Write failed (${reason}).`,
      'Compare the files with expectedBaseSha256 from a fresh workspace_check_write and run it again.',
    );
  }
}

/** One call of workspace_check_write (`write` false) or workspace_write (`write` true): the answer body. */
export async function workspaceWrite(workspace: McpWorkspace, args: WorkspaceWriteArgs, write: boolean): Promise<Body> {
  const started = Date.now();
  const audit = () => ({ jobId: randomUUID(), permission: write ? 'project:write' : 'project:read', durationMs: Date.now() - started });
  const answer = (body: Body): Body => ({ ...body, audit: audit() });
  if (!sameDirectoryIdentity(workspace.identity, await directoryIdentity(workspace.root)))
    return answer(
      refusal('MCP_WORKSPACE_CHANGED', 'The workspace folder changed.', 'Its identity is not the one opened.', 'Restart zplc-mcp.'),
    );
  if (write) {
    const lesson = await workspaceLesson(workspace);
    if (lesson === 'changed')
      return answer(
        refusal('MCP_WORKSPACE_CHANGED', 'The user-data folder changed.', 'Its identity is not the one opened.', 'Restart zplc-mcp.'),
      );
    if (lesson?.solutionsHidden)
      return answer(
        refusal(
          'MCP_SOLUTIONS_HIDDEN',
          'This is a lesson workspace and the classroom setting hides solutions; nothing was written.',
          `Lesson ${lesson.lessonId}: hideSolutions is on, or the setting cannot be read (it fails closed).`,
          'Give the learner hints and let them edit the program in Studio; workspace_check_write still checks their files.',
        ),
      );
  }
  // 1. every path is an allowed surface inside the real root, named once, without a case collision with a program of src
  const seen = new Set<string>();
  let srcNames: string[] = [];
  try {
    srcNames = await readdir(join(workspace.root, 'src'));
  } catch {
    srcNames = [];
  }
  const targets: Target[] = [];
  for (const file of args.files) {
    const allowed = surface(file.path);
    const forbidden = (cause: string) =>
      answer(
        refusal('MCP_PATH_FORBIDDEN', 'A path is outside what this tool may write; nothing was written.', cause, PATH_NEXT_STEP, {
          validValues: SURFACES,
        }),
      );
    if (!allowed) return forbidden(`${JSON.stringify(file.path.slice(0, 256))} is not an allowed project file.`);
    if (seen.has(file.path.toLowerCase())) return forbidden(`${file.path} is named twice.`);
    seen.add(file.path.toLowerCase());
    if (file.path.startsWith('src/')) {
      const key = sourceNameKey(basename(file.path));
      const clash = srcNames.find((name) => sourceNameKey(name) === key && name !== basename(file.path));
      if (clash) return forbidden(`${file.path} is the same program name as src/${clash} (case and .ld/.ld.json do not tell them apart).`);
    }
    const located = await locate(workspace.root, file.path);
    if ('cause' in located) return forbidden(located.cause);
    targets.push({ ...located, kind: allowed.kind, content: file.content, final: file.content });
  }
  for (const key of Object.keys(args.expectedBaseSha256 ?? {}))
    if (!targets.some((target) => target.path === key))
      return answer(
        refusal(
          'MCP_INVALID_ARGUMENTS',
          'expectedBaseSha256 names a file the batch does not write.',
          key.slice(0, 256),
          'Name only paths of files.',
          {
            validValues: targets.map((target) => target.path),
          },
        ),
      );
  // 2. no credential in the manifest (IDE-030): the field is named, the value never echoed
  for (const target of targets.filter((item) => item.kind === 'manifest')) {
    let fields: string[] = [];
    try {
      fields = manifestSensitivePaths(JSON.parse(target.content));
    } catch {
      fields = [];
    }
    if (fields.length > 0)
      return answer(
        refusal(
          'MCP_SENSITIVE_FIELD',
          'zplc.json would hold a credential; nothing was written.',
          `zplc.json sets ${fields.join(', ')}.`,
          'Remove the field; set credentials only in Studio or in the local environment.',
          { fields },
        ),
      );
  }
  // 3. each file alone, then the whole project on an isolated copy
  const alone: ToolDiagnostic[] = [];
  for (const target of targets) {
    const checked = checkAlone(target.path, target.kind, target.content, surface(target.path)!.maxBytes);
    if ('diagnostics' in checked) alone.push(...checked.diagnostics);
    else target.final = checked.final;
  }
  if (alone.length > 0) return answer(invalid(alone));
  const together = await checkTogether(workspace, targets, write || args.compileCheck !== false, write && args.requireCompile === true);
  if ('ok' in together) return answer(together);
  const files = targets.map((target) => ({
    path: target.path,
    action: target.before ? 'replace' : 'create',
    ...(['ST', 'IL', 'LD', 'FBD', 'SFC'].includes(target.kind) ? { language: target.kind } : {}),
    canonicalized: target.final !== target.content,
    ...(target.before ? { beforeSha256: sha256(target.before.bytes) } : {}),
    afterSha256: sha256(target.final),
    byteLength: Buffer.byteLength(target.final, 'utf8'),
  }));
  if (!write)
    return answer({
      ok: true,
      dryRun: true,
      loadable: true,
      ...(together.compiled === undefined ? {} : { compiled: together.compiled }),
      files,
      diagnostics: together.compileDiagnostics,
    });
  // 4. the bytes a prior read saw are still there, and the workspace is the one that was checked
  for (const [path, expected] of Object.entries(args.expectedBaseSha256 ?? {})) {
    const target = targets.find((item) => item.path === path)!;
    const current = await locate(workspace.root, path);
    if (
      'cause' in current ||
      !current.before ||
      sha256(current.before.bytes) !== expected ||
      !target.before ||
      !current.before.bytes.equals(target.before.bytes)
    )
      return answer(
        refusal(
          'MCP_WORKSPACE_CHANGED',
          `${path} is not the file you read.`,
          `Its sha256 is not ${expected}.`,
          'Read the file again and redo the change.',
        ),
      );
  }
  if (!sameDirectoryIdentity(workspace.identity, await directoryIdentity(workspace.root)))
    return answer(
      refusal('MCP_WORKSPACE_CHANGED', 'The workspace folder changed.', 'Its identity is not the one opened.', 'Restart zplc-mcp.'),
    );
  const failure = await commit(workspace, targets);
  if (failure) return answer(failure);
  // a file of the root (zplc.json, a scene, a new tests folder) changes the root's ctime: the server keeps serving this root
  const after = await directoryIdentity(workspace.root);
  if (after && sameRoot(workspace.identity, after)) (workspace as { identity: DirectoryIdentity }).identity = after;
  return answer({ ok: true, written: files, compiled: together.compiled ?? false, compileDiagnostics: together.compileDiagnostics });
}
