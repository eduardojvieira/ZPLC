/**
 * Build in the web build (REL-037). The desktop app builds the folder in its main process (the canonical build); a page has
 * no main process, so this reads the open folder through its directory handle and runs the same compiler on the same sources,
 * and answers in the shape the main process does, which the toolbar already presents. It reads what the main process reads
 * (zplc.json, `src` and the libraries of the manifest, with the same limits and the same file rule) and writes nothing.
 */
import { CompilerError, assertTaskProgramCardinality, compileMultiTaskProject } from '../compiler';
import { markProgramInputs } from '../cli/programInputs';
import { buildOptionsOf } from '../project/buildOptions';
import { parseAndMigrateProject } from '../project/projectModel';
import { resolveProgramSource } from '../utils/programSourceResolution';
import { getLanguageFromFilename, type PLCLanguage } from '../types';
import { t } from '../i18n';
import { isWebBuild } from './webCapabilities';

const MANIFEST_MAX_BYTES = 128 * 1024;
const SOURCE_MAX_BYTES = 256 * 1024;
const SOURCES_MAX_COUNT = 128;
const SOURCES_MAX_BYTES = 2 * 1024 * 1024;
// The file rule of cli/workspace.ts (SUPPORTED_SOURCE): ST, IL and the visual languages, with the short .ld, .fbd and .sfc.
const SUPPORTED_SOURCE = /\.(st|il|(ld|fbd|sfc)(\.json)?)$/i;

interface Diagnostic {
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  element?: string;
  phase?: string;
}
interface Source {
  name: string;
  path: string;
  content: string;
  language: PLCLanguage;
  bytes: Uint8Array;
  library?: string;
}

const failure = (...diagnostics: Diagnostic[]) => ({
  ok: false as const,
  evidence: { schemaVersion: 1 as const, operation: 'compile' as const, outcome: 'failed' as const, diagnostics, artifacts: [] },
});

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

function compilerDiagnostic(error: CompilerError): Diagnostic {
  return {
    code: error.code,
    message: error.detail.slice(0, 512) || t('web.build.failed'),
    phase: error.phase,
    line: error.line,
    column: error.column,
    ...(error.endLine !== undefined && error.endColumn !== undefined ? { endLine: error.endLine, endColumn: error.endColumn } : {}),
    ...(error.sourceRef ? { path: error.sourceRef } : {}),
    ...(error.element ? { element: error.element } : {}),
  };
}

const compilerDiagnostics = (error: unknown): Diagnostic[] =>
  error instanceof CompilerError
    ? error.errors.slice(0, 128).map(compilerDiagnostic)
    : [{ code: 'INTERNAL_COMPILER_ERROR', message: t('web.build.failed') }];

async function fileBytes(directory: FileSystemDirectoryHandle, name: string, limit: number): Promise<Uint8Array | null> {
  try {
    const file = await (await directory.getFileHandle(name)).getFile();
    if (file.size > limit) return null;
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function folder(root: FileSystemDirectoryHandle, logical: string): Promise<FileSystemDirectoryHandle | null> {
  let directory = root;
  try {
    for (const part of logical.split('/')) directory = await directory.getDirectoryHandle(part);
  } catch {
    return null;
  }
  return directory;
}

/** The programs and libraries of the open folder; a diagnostic when one cannot be read. */
async function readSources(
  root: FileSystemDirectoryHandle,
  folders: Array<{ logical: string; library?: string }>,
): Promise<{ sources: Source[] } | { diagnostic: Diagnostic }> {
  const sources: Source[] = [];
  let total = 0;
  const decoder = new TextDecoder();
  for (const { logical, library } of folders) {
    const directory = await folder(root, logical);
    if (!directory)
      return {
        diagnostic: {
          code: 'WORKSPACE_MISSING',
          message: t(library === undefined ? 'web.build.noSource' : 'web.build.noLibrary'),
          path: logical,
        },
      };
    const names = new Set<string>();
    const entries: string[] = [];
    for await (const entry of directory.values()) if (entry.kind === 'file' && SUPPORTED_SOURCE.test(entry.name)) entries.push(entry.name);
    for (const name of entries.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))) {
      const path = `${logical}/${name}`;
      if (sources.length >= SOURCES_MAX_COUNT)
        return { diagnostic: { code: 'WORKSPACE_LIMIT', message: t('web.build.tooMany'), path: logical } };
      const key = name.toLowerCase().replace(/\.(ld|fbd|sfc)$/, '$&.json');
      if (names.has(key)) return { diagnostic: { code: 'WORKSPACE_DUPLICATE_SOURCE', message: t('web.build.duplicate'), path } };
      names.add(key);
      const bytes = await fileBytes(directory, name, SOURCE_MAX_BYTES);
      if (!bytes) return { diagnostic: { code: 'WORKSPACE_READ_FAILED', message: t('web.build.unreadable'), path } };
      total += bytes.byteLength;
      if (total > SOURCES_MAX_BYTES) return { diagnostic: { code: 'WORKSPACE_LIMIT', message: t('web.build.tooLarge'), path: logical } };
      sources.push({
        name,
        path,
        content: decoder.decode(bytes),
        language: getLanguageFromFilename(name),
        bytes,
        ...(library === undefined ? {} : { library }),
      });
    }
  }
  return { sources };
}

/** Builds the folder and answers as the main process does: the artifacts of a good build, or the diagnostics of a failed one. */
export async function compileWebWorkspace(root: FileSystemDirectoryHandle): Promise<unknown> {
  const manifest = await fileBytes(root, 'zplc.json', MANIFEST_MAX_BYTES);
  if (!manifest) return failure({ code: 'WORKSPACE_MISSING', message: t('web.build.noManifest'), path: 'zplc.json' });
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(manifest));
  } catch {
    return failure({ code: 'PROJECT_INVALID', message: t('web.build.notJson'), path: 'zplc.json' });
  }
  const parsed = parseAndMigrateProject(raw);
  if (!parsed.ok)
    return failure(
      ...parsed.diagnostics.map((diagnostic) => ({ code: 'PROJECT_INVALID', message: diagnostic.message, path: diagnostic.path })),
    );
  const project = parsed.project;

  const read = await readSources(root, [
    { logical: 'src' },
    ...buildOptionsOf(project).libraries.map((library) => ({ logical: library, library })),
  ]);
  if ('diagnostic' in read) return failure(read.diagnostic);
  try {
    assertTaskProgramCardinality(project);
  } catch (error) {
    return failure(...compilerDiagnostics(error));
  }

  // Programs are the files of `src` that a task runs; the Structured Text files that no task runs are built with them (CMP-042).
  const programSources = read.sources.filter((source) => source.library === undefined);
  const unresolved: Diagnostic[] = [];
  const byProgram = new Map<string, ReturnType<typeof resolveProgramSource>>();
  project.tasks.forEach((task, taskIndex) =>
    task.programs.forEach((program, programIndex) => {
      const source = resolveProgramSource(program, programSources);
      if (source) byProgram.set(program, source);
      else
        unresolved.push({
          code: 'PROGRAM_NOT_FOUND',
          message: t('web.build.noProgram'),
          path: `tasks[${taskIndex}].programs[${programIndex}]`,
        });
    }),
  );
  if (unresolved.length > 0) return failure(...unresolved);
  const bytesByPath = new Map(read.sources.map((source) => [source.path, source.bytes]));
  const programs = [...byProgram].flatMap(([name, source]) => {
    const bytes = source?.sourceRef === undefined ? undefined : bytesByPath.get(source.sourceRef);
    return source && source.sourceRef !== undefined && bytes ? [{ ...source, name, sourceRef: source.sourceRef, bytes }] : [];
  });
  const run = new Set(programs.map((source) => source.sourceRef));
  const libraries = read.sources
    .filter((source) => source.language === 'ST' && !run.has(source.path))
    .map((source) => ({
      name: source.path,
      content: source.content,
      language: source.language,
      sourceRef: source.path,
      bytes: source.bytes,
      ...(source.library === undefined ? {} : { library: source.library }),
    }));
  const sources = [...programs, ...libraries];

  try {
    const result = compileMultiTaskProject(project, sources);
    markProgramInputs(result.debugMap, sources);
    const zplcFile = result.zplcFile;
    const digest = await crypto.subtle.digest('SHA-256', zplcFile as unknown as BufferSource);
    return {
      ok: true,
      summary: { name: project.name, version: project.version, taskCount: project.tasks.length, codeSize: result.codeSize },
      artifact: {
        zplcFile,
        bytecode: result.bytecode,
        assembly: result.programDetails.map((program) => `; === ${program.name} ===\n${program.assembly}`).join('\n\n'),
        debugMap: result.debugMap,
      },
      zplcEvidence: { kind: 'zplc', sha256: hex(digest), byteLength: zplcFile.byteLength },
    };
  } catch (error) {
    return failure(...compilerDiagnostics(error));
  }
}

/** The build as the toolbar asks for it: the web build has this where the desktop app has the bridge of its main process. */
export function webBuildBridge(
  directory: () => FileSystemDirectoryHandle | null,
): { compile(request: { workspaceId: string }): Promise<unknown>; cancel(): Promise<{ requested: boolean }> } | undefined {
  if (!isWebBuild()) return undefined;
  return {
    compile: async () => {
      const root = directory();
      return root ? compileWebWorkspace(root) : failure({ code: 'WORKSPACE_MISSING', message: t('web.build.noFolder') });
    },
    // a build in the page cannot be interrupted once started; it takes well under a second
    cancel: async () => ({ requested: false }),
  };
}
