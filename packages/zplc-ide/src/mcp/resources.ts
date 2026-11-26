/**
 * The read side an agent uses to learn the open project (AIX-001, AIX-002, AIX-013): the plant scene and its map, the
 * scenarios, the current lesson and the six file formats. The fields an agent may see are picked by `buildProjectContext`
 * (src/ai/projectContext.ts), shared with the Studio assistant; this module reads the saved files with the workspace reader's
 * limits and cuts what it hands over to MCP_CONTEXT_CAPS, so no answer grows with the project.
 *
 * Read-only: nothing here writes a file, and nothing here starts a process.
 */
import { statSync } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { readSolutionsHidden } from '../../shared/learnPolicyModel';
import { buildProjectContext, lessonIdOfWorkspace } from '../ai/projectContext';
import { directoryIdentity, sameDirectoryIdentity } from '../cli/firmwareBuildRunner';
import { readWorkspace, readWorkspaceProjectFile, readWorkspaceScenarios } from '../cli/workspace';
import { FORMATS, type FormatId } from '../formats';
import { scenarioFormat } from '../formats/scenario';
import '../plant/core/plantCore'; // registers the shipped parts in the catalogue
import { catalogue } from '../plant/core/catalogue';
import { parseScene, sceneSignals, validateScene } from '../plant/core/scene';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { courseCounts, passedIn } from '../learn/course';
import type { LessonIndex } from '../learn/lessonPackage';
import {
  LEARN_PROGRESS_FILENAME,
  LEARN_PROGRESS_LEGACY_FILENAME,
  LEARN_PROGRESS_MAX_BYTES,
  emptyProgress,
  migrateLegacyMastery,
  parseProgress,
  type LearnProgress,
} from '../../shared/learnProgressModel';
import { validatePlantMap } from '../plants/plantMap';
import type { McpToolName, McpWorkspace } from './server';

/** What one answer may hold, at any depth: items of a list, characters of a string, keys of an object, levels of nesting. */
export const MCP_CONTEXT_CAPS = { listItems: 64, textChars: 256, objectKeys: 64, depth: 8 } as const;
/** The largest scene or plant map file read, as the scene runner reads them (learn/sceneRun.ts). */
const SCENE_FILE_MAX_BYTES = 512 * 1024;

type Body = Record<string, unknown>;

/** The physical boundary every surface of the server states, in the wording of 2.0 (AGENTS.md rule 8). */
export const MCP_BOUNDARY = 'AGENTS.md rule 8: MCP cannot flash, deploy, force, run, stop, recover, access serial, or run a shell.';

/** How an agent works with this server and where the boundary is (AIX-008). The boundary is the wording of 2.0. */
export const MCP_INSTRUCTIONS = [
  'ZPLC local MCP server: one IEC 61131-3 project folder, read, checked and simulated on this computer.',
  '',
  'How to work:',
  '1. Read first: call project_inspect, then plant_inspect when the project has a scene or a plant map, and scenarios_list. Read a ' +
    'program with zplc://project/source/{name}; in a lesson, read zplc://lesson/current.',
  '2. Read the format before you write a JSON file: zplc://formats/ld, zplc://formats/fbd, zplc://formats/sfc, zplc://formats/scene, ' +
    'zplc://formats/plant-map and zplc://formats/scenario give the schema, the accepted values and a worked example.',
  '3. This server writes no file. Edit the project with your own client, then check it with project_validate, compiler_check and ' +
    'safety_check, and read the located diagnostics.',
  '4. Run it on the host simulator: scenario_run or tests_run, then trace_get or runtime_snapshot to see what happened. Read the ' +
    'failed checks of the result.',
  '5. When a tool does not answer as expected, call server_self_check.',
  '',
  'Evidence: every tool result states evidenceLevel once (host-static, host-simulation, local-cross-build or repository-metadata). ' +
    'A host simulation is never evidence of hardware or HIL.',
  '',
  `Boundary: ${MCP_BOUNDARY} When the user asks for one of these, say so in plain words and tell them to do it themselves in ZPLC ` +
    'Studio.',
].join('\n');

export const MCP_PROMPT_NAMES = ['implement_program', 'debug_failing_scenario', 'explain_with_evidence'] as const;

/** The prompts an agent can ask for (AIX-008): each one the steps of a task with the tools of this server. */
export function registerPrompts(server: McpServer): void {
  const prompt = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] });
  server.registerPrompt(
    'implement_program',
    {
      title: 'Implement a program',
      description: 'Steps to write or change a program of this project and prove it on the host simulator.',
      argsSchema: z.object({ language: z.enum(['ST', 'IL', 'LD', 'FBD', 'SFC']), goal: z.string().min(1).max(2000) }),
    },
    ({ language, goal }) =>
      prompt(
        `Goal: ${goal}\nLanguage: ${language}\n` +
          '1. Call project_inspect, symbols_list and, when the project has a scene, plant_inspect.\n' +
          (['LD', 'FBD', 'SFC'].includes(language)
            ? `2. Read zplc://formats/${language.toLowerCase()} before you write the file.\n`
            : '2. Read the current program with zplc://project/source/{name}.\n') +
          '3. Edit the file with your own client; this server writes no file.\n' +
          '4. Call project_validate and compiler_check, fix each located diagnostic, then run scenario_run or tests_run.\n' +
          '5. Report what passed, with the evidence level of each result.',
      ),
  );
  server.registerPrompt(
    'debug_failing_scenario',
    {
      title: 'Debug a failing scenario',
      description: 'Steps to find why one scenario fails, from its failed checks to the recorded trace.',
      argsSchema: z.object({ scenarioId: z.string().min(1).max(128) }),
    },
    ({ scenarioId }) =>
      prompt(
        `Scenario: ${scenarioId}\n` +
          '1. Read zplc://project/scenario/{scenarioId} and call scenario_run with this id.\n' +
          '2. Read the failed checks of the result: the signal, the expected and the observed value.\n' +
          '3. Call trace_get and find the first sample where the output differs from the expectation.\n' +
          '4. Read the program and explain the cause with the file and line, then propose the smallest change.',
      ),
  );
  server.registerPrompt(
    'explain_with_evidence',
    {
      title: 'Explain with evidence',
      description: 'Answer a question about the project with a tool result behind every claim.',
      argsSchema: z.object({ question: z.string().min(1).max(2000) }),
    },
    ({ question }) =>
      prompt(
        `Question: ${question}\n` +
          'Back every claim with a result of compiler_check, safety_check, scenario_run or trace_get. Cite the file, line or element ' +
          'it is about and state the evidence level of the result. A host simulation is not evidence of hardware.',
      ),
  );
}

/**
 * Whether the host runtime binary that scenario runs need is on this computer. Only files are looked at: nothing is started.
 * ponytail: mirrors the lookup of shared/nativeSimulationSupervisor.ts (the variable, then a checkout's build folder); export
 * its resolver if the two drift.
 */
export function nativeSimulatorReady(environment: NodeJS.ProcessEnv = process.env): boolean {
  const isFile = (path: string) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  };
  if (environment.ZPLC_NATIVE_SIM_BIN) return isFile(environment.ZPLC_NATIVE_SIM_BIN);
  const build = 'firmware/lib/zplc_core/build/zplc_runtime';
  let checkout: string[] = [];
  try {
    checkout = [fileURLToPath(new URL('../../../../', import.meta.url))];
  } catch {
    checkout = [];
  }
  const bases = [...checkout, process.cwd(), join(process.cwd(), '..'), join(process.cwd(), '../..'), join(process.cwd(), '../../..')];
  return bases.some((base) => isFile(join(base, build)) || isFile(join(base, `${build}.exe`)));
}

/** The modern revision the SDK serves beside its 2025-era list; the SDK does not export it (index.ts serves both eras, D-35). */
export const MODERN_PROTOCOL_REVISION = '2026-07-28';

/** What a result is evidence of, stated once at the top of every result (AIX-008, plan-aix §3.1). */
export const EVIDENCE_LEVEL: Record<McpToolName, 'host-static' | 'host-simulation' | 'local-cross-build' | 'repository-metadata'> = {
  project_inspect: 'host-static',
  project_validate: 'host-static',
  compiler_check: 'host-static',
  compiler_compile: 'host-static',
  symbols_list: 'host-static',
  safety_check: 'host-static',
  plant_inspect: 'host-static',
  scenarios_list: 'host-static',
  tests_run: 'host-simulation',
  scenario_run: 'host-simulation',
  simulation_start: 'host-simulation',
  simulation_step: 'host-simulation',
  runtime_snapshot: 'host-simulation',
  trace_get: 'host-simulation',
  firmware_build: 'local-cross-build',
  boards_list: 'repository-metadata',
  toolchain_inspect: 'repository-metadata',
  server_self_check: 'repository-metadata',
};

export interface McpSelfCheck {
  serverVersion: string;
  workspaceName?: string;
  workspaceValid: boolean;
  hasRepository: boolean;
  hasUserData: boolean;
  nativeSimulatorReady: boolean;
  protocolsServed: string[];
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  boundary: string;
}

/** The value cut to MCP_CONTEXT_CAPS, and whether anything was cut. */
export function bounded(value: unknown): { value: unknown; truncated: boolean } {
  let truncated = false;
  const text = (item: string): string => {
    if (item.length <= MCP_CONTEXT_CAPS.textChars) return item;
    truncated = true;
    return item.slice(0, MCP_CONTEXT_CAPS.textChars);
  };
  const walk = (item: unknown, depth: number): unknown => {
    if (typeof item === 'string') return text(item);
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (item === null || typeof item !== 'object') return typeof item === 'boolean' ? item : null;
    if (depth >= MCP_CONTEXT_CAPS.depth) {
      truncated = true;
      return null;
    }
    if (Array.isArray(item)) {
      if (item.length > MCP_CONTEXT_CAPS.listItems) truncated = true;
      return item.slice(0, MCP_CONTEXT_CAPS.listItems).map((entry) => walk(entry, depth + 1));
    }
    const entries = Object.entries(item).filter(([, entry]) => entry !== undefined);
    if (entries.length > MCP_CONTEXT_CAPS.objectKeys) truncated = true;
    return Object.fromEntries(entries.slice(0, MCP_CONTEXT_CAPS.objectKeys).map(([key, entry]) => [text(key), walk(entry, depth + 1)]));
  };
  const out = walk(value, 0);
  return { value: out, truncated };
}

/** `{ ok: true, ...fields }` cut to the caps, with `truncated: true` when something was cut. */
function okBody(fields: Body): Body {
  const { value, truncated } = bounded(fields);
  return { ok: true, ...(value as Body), ...(truncated ? { truncated: true } : {}) };
}

/** `{ ok: false, error, ...fields }` cut to the caps, with `truncated: true` when something was cut: errors say so too. */
function errorBody(error: string, fields: Body): Body {
  const { value, truncated } = bounded(fields);
  return { ok: false, error, ...(value as Body), ...(truncated ? { truncated: true } : {}) };
}

const sameIdentity = sameDirectoryIdentity;

async function unchanged(workspace: McpWorkspace): Promise<boolean> {
  return sameDirectoryIdentity(workspace.identity, await directoryIdentity(workspace.root));
}

type Diagnostic = { code: string; message: string; path?: string };

/** One project file: its text, `missing` when it is not there, or the diagnostics of a refusal. */
async function projectFile(root: string, path: string): Promise<{ text: string } | 'missing' | { diagnostics: Diagnostic[] }> {
  const read = await readWorkspaceProjectFile(root, path, SCENE_FILE_MAX_BYTES);
  if (read.ok) return { text: Buffer.from(read.bytes).toString('utf8') };
  const absent = await lstat(join(root, path)).then(
    () => false,
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT' || error.code === 'ENOTDIR',
  );
  return absent ? 'missing' : { diagnostics: read.diagnostics as Diagnostic[] };
}

const FACT_NAMES = [
  ...new Set([
    ...scenarioFormat.acceptedValues.booleanFacts!,
    ...scenarioFormat.acceptedValues.integerFacts!,
    ...scenarioFormat.acceptedValues.realFacts!,
  ]),
];

/**
 * The scene, the signals it offers, the plant map and whether each map point names a variable of the compiled program. An
 * omitted file name is `scene.json` or `plant-map.json`, and when that file is absent the answer says so; a file named on
 * purpose that is absent is MCP_NOT_FOUND. `symbols` compiles the program and answers its variables, or undefined when it
 * does not compile.
 */
export async function plantInspect(
  workspace: McpWorkspace,
  args: { sceneFile?: string; mapFile?: string },
  symbols: () => Promise<Array<{ pou: string; name: string }> | undefined>,
): Promise<Body> {
  if (!(await unchanged(workspace))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const sceneFile = args.sceneFile ?? 'scene.json';
  const mapFile = args.mapFile ?? 'plant-map.json';
  const [sceneRead, mapRead] = [await projectFile(workspace.root, sceneFile), await projectFile(workspace.root, mapFile)];
  for (const [read, explicit, file] of [
    [sceneRead, args.sceneFile !== undefined, sceneFile],
    [mapRead, args.mapFile !== undefined, mapFile],
  ] as const) {
    if (read === 'missing' && explicit) return { ok: false, error: 'MCP_NOT_FOUND', cause: `${file} is not in the project` };
    if (typeof read === 'object' && 'diagnostics' in read) return errorBody('MCP_WORKSPACE_UNREADABLE', { diagnostics: read.diagnostics });
  }
  const diagnostics: Diagnostic[] = [];
  let scene: unknown;
  if (typeof sceneRead === 'object' && 'text' in sceneRead) {
    // the structure (parseScene), then the catalogue: a part id, a config key or value it does not have (validateScene)
    const parsed = parseScene(sceneRead.text);
    const problems = 'problems' in parsed ? parsed.problems : validateScene(parsed.scene, catalogue);
    diagnostics.push(
      ...problems.map((problem) => ({ code: 'SCENE_INVALID', path: sceneFile, message: `${problem.path}: ${problem.message}` })),
    );
    if (!('problems' in parsed) && problems.length === 0) scene = parsed.scene;
  }
  let map: unknown;
  if (typeof mapRead === 'object' && 'text' in mapRead) {
    try {
      map = JSON.parse(mapRead.text);
      diagnostics.push(...validatePlantMap(map).map((message) => ({ code: 'SCENE_MAP_INVALID', path: mapFile, message })));
    } catch {
      diagnostics.push({ code: 'SCENE_MAP_INVALID', path: mapFile, message: 'The plant map is not valid JSON' });
    }
  }
  if (diagnostics.length > 0) return errorBody('MCP_VALIDATION_FAILED', { diagnostics });
  const bindingProblems: string[] = [];
  const mapSignals = (map as { signals?: unknown } | undefined)?.signals;
  if (mapSignals && typeof mapSignals === 'object' && !Array.isArray(mapSignals)) {
    const known = await symbols();
    if (!known) bindingProblems.push('The program does not compile, so the map points were not checked: call compiler_check.');
    else {
      const names = new Set(known.map((symbol) => `${symbol.pou}.${symbol.name}`));
      for (const [name, signal] of Object.entries(mapSignals as Record<string, { point?: unknown }>))
        if (typeof signal?.point !== 'string' || !names.has(signal.point))
          bindingProblems.push(`${name}: ${String(signal?.point)} is not a variable of the compiled program`);
    }
  }
  if (!(await unchanged(workspace))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const plant = buildProjectContext({ scene, plantMap: map, bindingProblems }).plant;
  const offered = scene
    ? sceneSignals(scene as Parameters<typeof sceneSignals>[0], catalogue).map(({ name, direction, type, unit, range }) => ({
        name,
        direction,
        type,
        ...(unit === undefined ? {} : { unit }),
        ...(range === undefined ? {} : { range }),
      }))
    : [];
  return okBody({
    summary: {
      sceneFile,
      mapFile,
      hasScene: scene !== undefined,
      hasPlantMap: map !== undefined,
      ...(plant?.scene ? { scene: plant.scene } : {}),
      offeredSignals: offered,
      ...(map !== undefined ? { plantMap: { signals: plant?.signals ?? [], bindingProblems: plant?.problems ?? [] } } : {}),
      factNames: FACT_NAMES,
    },
  });
}

/** The scene alone, as zplc://project/scene serves it; MCP_NOT_FOUND when the project has none. */
export async function sceneResource(workspace: McpWorkspace): Promise<Body> {
  const read = await plantInspect(workspace, {}, async () => undefined);
  const summary = read.summary as Body | undefined;
  if (!summary) return read;
  if (summary.hasScene !== true) return { ok: false, error: 'MCP_NOT_FOUND', cause: 'The project has no scene.json.' };
  const { sceneFile, scene, offeredSignals, factNames } = summary;
  return {
    ok: true,
    scene: { file: sceneFile, ...(scene as object), offeredSignals, factNames },
    ...(read.truncated ? { truncated: true } : {}),
  };
}

/** The plant map and its binding problems, as zplc://project/plant-map serves it; MCP_NOT_FOUND when the project has none. */
export async function plantMapResource(workspace: McpWorkspace, symbols: Parameters<typeof plantInspect>[2]): Promise<Body> {
  const read = await plantInspect(workspace, {}, symbols);
  const summary = read.summary as Body | undefined;
  if (!summary) return read;
  if (summary.hasPlantMap !== true) return { ok: false, error: 'MCP_NOT_FOUND', cause: 'The project has no plant-map.json.' };
  return { ok: true, plantMap: { file: summary.mapFile, ...(summary.plantMap as object) }, ...(read.truncated ? { truncated: true } : {}) };
}

/** The scenarios of `tests/`: none when the folder is absent; a refusal of the reader answers its diagnostics. */
async function scenarioFiles(workspace: McpWorkspace): Promise<Array<{ path: string; input: unknown }> | Body> {
  if (!(await unchanged(workspace))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const read = await readWorkspaceScenarios(workspace.root);
  if (!(await unchanged(workspace))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (read.ok) return read.scenarios.map(({ path, input }) => ({ path, input }));
  const diagnostics = read.diagnostics as Diagnostic[];
  // no tests folder, or one with no scenario file, is a project with no scenarios
  if (
    diagnostics.length === 1 &&
    ['WORKSPACE_MISSING', 'TEST_SCENARIOS_MISSING'].includes(diagnostics[0]!.code) &&
    diagnostics[0]!.path === 'tests'
  )
    return [];
  return errorBody('MCP_WORKSPACE_UNREADABLE', { diagnostics });
}

/** Every scenario with its id, timing, scene and a summary of each expectation (the signals and facts it reads). */
export async function scenariosList(workspace: McpWorkspace): Promise<Body> {
  const files = await scenarioFiles(workspace);
  if (!Array.isArray(files)) return files;
  const scenarios = buildProjectContext({ scenarios: files }).scenarios;
  return okBody({ summary: { count: scenarios.length, scenarios } });
}

/** The list of scenarios_list at the top level, as zplc://project/scenarios serves it. */
export async function scenariosResource(workspace: McpWorkspace): Promise<Body> {
  const { summary, ...rest } = await scenariosList(workspace);
  return { ...rest, ...(summary as object) };
}

/** The whole definition of one scenario, as saved; an unknown id answers the valid ones. */
export async function scenarioResource(workspace: McpWorkspace, scenarioId: string): Promise<Body> {
  const files = await scenarioFiles(workspace);
  if (!Array.isArray(files)) return files;
  const idOf = (input: unknown) => (input && typeof input === 'object' ? (input as { id?: unknown }).id : undefined);
  const found = files.find((file) => idOf(file.input) === scenarioId);
  // A scenario file is at most 128 KiB (cli/workspace.ts), so the definition is served whole: an agent edits it.
  if (found) return { ok: true, path: found.path, scenario: found.input };
  const ids = files.map((file) => idOf(file.input)).filter((id): id is string => typeof id === 'string');
  return errorBody('MCP_NOT_FOUND', { validValues: ids });
}

/**
 * The lesson of a lesson workspace (`<userData>/learn-workspaces/<lessonId>`): its title, goal, objectives and hints, never
 * its solution, and whether solutions are hidden. That is read from `<userData>` with `readSolutionsHidden` (shared/learnPolicyModel.ts),
 * which fails
 * closed; no argument, tool or resource changes it. A lesson found by its folder name without `--user-data`, or under a
 * user-data folder that is not the one given, is always hidden.
 *
 * Known limit: if the user-data folder is unwritable, an older policy file that shows solutions can stay on disk until Studio
 * saves the setting again; Studio reports that save error to the person (electron/learnPolicy.ts).
 */
export async function lessonCurrentResource(workspace: McpWorkspace): Promise<Body> {
  if (!(await unchanged(workspace))) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const userData = workspace.userData;
  if (userData && !sameDirectoryIdentity(userData.identity, await directoryIdentity(userData.root)))
    return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  const underUserData = userData ? lessonIdOfWorkspace(workspace.root, join(userData.root, 'learn-workspaces')) : undefined;
  const parent = dirname(workspace.root);
  const byFolder = basename(parent) === 'learn-workspaces' ? lessonIdOfWorkspace(workspace.root, parent) : undefined;
  const lessonId = underUserData ?? byFolder;
  const entry = lessonId ? LESSON_INDEX.lessons.find((lesson) => lesson.id === lessonId) : undefined;
  if (!entry) return { ok: false, error: 'MCP_NOT_FOUND', cause: 'The project is not a lesson workspace of this ZPLC.' };
  const solutionsHidden = underUserData ? await readSolutionsHidden(userData!.root) : true;
  const { lesson } = buildProjectContext({ lesson: { manifest: entry, text: entry.text.en } }, { solutionsHidden });
  return lesson ? okBody({ lesson }) : { ok: false, error: 'MCP_NOT_FOUND', cause: 'The lesson has no text in this ZPLC.' };
}

/** One format module as it is: id, title, summary, file pattern, JSON Schema, accepted values and worked examples. */
export function formatResource(id: FormatId): Body {
  const format = FORMATS.find((candidate) => candidate.id === id);
  return format ? { ok: true, ...(JSON.parse(JSON.stringify(format)) as Body) } : { ok: false, error: 'MCP_NOT_FOUND' };
}

/**
 * @internal Small test seam; never returns paths or raw user-data.
 *
 * Read-only (LRN-034): this reads the progress file the Studio keeps and answers which lessons are passed. It has no
 * operation that writes progress, and a file of the first release is migrated in memory only, never written back.
 */
export async function courseProgressResource(workspace: McpWorkspace, index: LessonIndex = LESSON_INDEX): Promise<Record<string, unknown>> {
  if (!workspace.userData) return { ok: false, error: 'MCP_CAPABILITY_UNAVAILABLE', reason: 'requires-explicit-user-data' };
  // This directory is user-managed progress storage, so its entry generation changes when the progress file is created.
  const sameUserData = async (): Promise<boolean> => {
    const current = await directoryIdentity(workspace.userData!.root);
    return (
      !!current &&
      workspace.userData!.identity.path === current.path &&
      workspace.userData!.identity.dev === current.dev &&
      workspace.userData!.identity.ino === current.ino
    );
  };
  if (!(await sameUserData())) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  /** The text of a regular, bounded, unlinked file; undefined when absent; null when it cannot be trusted. */
  const readBounded = async (name: string, limit: number): Promise<string | undefined | null> => {
    const file = join(workspace.userData!.root, name);
    try {
      const status = await lstat(file);
      if (status.isSymbolicLink() || !status.isFile() || status.size > limit) return null;
      const text = await readFile(file, 'utf8');
      return Buffer.byteLength(text, 'utf8') > limit ? null : text;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
      return null;
    }
  };
  let progress: LearnProgress | undefined;
  const current = await readBounded(LEARN_PROGRESS_FILENAME, LEARN_PROGRESS_MAX_BYTES);
  if (current === null) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
  if (current !== undefined) progress = parseProgress(current);
  else {
    const legacy = await readBounded(LEARN_PROGRESS_LEGACY_FILENAME, 4096);
    if (legacy === null) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
    progress = legacy === undefined ? emptyProgress() : migrateLegacyMastery(legacy);
  }
  if (!(await sameUserData())) return { ok: false, error: 'MCP_WORKSPACE_CHANGED' };
  if (!progress) return { ok: false, error: 'MCP_INTERNAL_ERROR' };
  // Only lessons this build knows are reported; progress for any other lesson is kept inert in the file. A lesson is passed
  // as the course counts it: a hardware-only lesson by its passing hardware check (LRN-024).
  const mastered = index.lessons.map((lesson) => lesson.id).filter((id) => passedIn(index, id, progress!));
  // The count is the course's: an alternative pair counts once, and the sibling not taken is never listed as passed (M7-K5).
  const { passed, total } = courseCounts(index, progress);
  return { ok: true, schemaVersion: 1, mastered, completed: passed, total };
}

/**
 * The programs of `src`, read by the workspace reader with its limits and its refusal of links; false when the root changed or is
 * unreadable.
 */
async function readPrograms(workspace: McpWorkspace) {
  if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { error: 'MCP_WORKSPACE_CHANGED' } as const;
  const loaded = await readWorkspace(workspace.root);
  if (!sameIdentity(workspace.identity, await directoryIdentity(workspace.root))) return { error: 'MCP_WORKSPACE_CHANGED' } as const;
  return loaded.ok
    ? ({ sources: loaded.workspace.sources.filter((source) => source.library === undefined) } as const)
    : ({ error: 'MCP_WORKSPACE_UNREADABLE' } as const);
}

/** @internal The list of the programs of the project: name, path and language. Read-only (IDE-030). */
export async function programsResource(workspace: McpWorkspace): Promise<Record<string, unknown>> {
  const read = await readPrograms(workspace);
  if ('error' in read) return { ok: false, error: read.error };
  return { ok: true, programs: read.sources.map(({ name, path, language }) => ({ name, path, language })) };
}

/** @internal The text and the language of one program of `src`. There is no resource, tool or argument that writes it. */
export async function sourceResource(workspace: McpWorkspace, name: string): Promise<Record<string, unknown>> {
  if (name.length === 0 || name.length > 128 || name === '.' || name === '..' || /[/\\\0\r\n]/.test(name))
    return { ok: false, error: 'MCP_INVALID_ARGUMENTS' };
  const read = await readPrograms(workspace);
  if ('error' in read) return { ok: false, error: read.error };
  const source = read.sources.find((candidate) => candidate.name === name);
  return source
    ? { ok: true, name: source.name, path: source.path, language: source.language, source: source.content }
    : { ok: false, error: 'MCP_NOT_FOUND' };
}
