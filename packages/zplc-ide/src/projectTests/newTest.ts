/**
 * "New test" (TST-009): writes `tests/<Program>.scenario.json` for the first program of the project and opens it. The file starts
 * with one expectation, which the presentation requires: the first BOOL output of the program is off at time 0. A program with no
 * BOOL output, or that does not build, is refused with the way on, and nothing is written. A name that is taken gets a number: an
 * existing test is never overwritten.
 */
import { compileSingleFileWithTask } from '../compiler';
import { t } from '../i18n';
import { entryProgramPath } from '../project/entryProgram';
import { compileScenario } from '../test-engine';
import type { FileLanguage, FileTreeNode, PLCLanguage, ZPLCProjectConfig } from '../types';
import { findFileInTree } from '../utils/fileSystem';

const TESTS_FOLDER = 'tests';
const SUFFIX = '.scenario.json';

/** What a new test needs of the project, so that the logic runs without a store. */
export interface NewTestContext {
  config: ZPLCProjectConfig | null;
  tree: FileTreeNode | null;
  /** The text of a project file as the editor knows it: the open buffer first, else the disk; null when it cannot be read. */
  read: (path: string) => Promise<string | null>;
  createFolder: (parent: string, name: string) => Promise<void>;
  /** Creates the file with this content, opens it, and returns its id. */
  createFile: (name: string, language: FileLanguage, parent: string, content: string) => Promise<string>;
}

export type NewTestResult = { ok: true; path: string; id: string; fileId: string; signal: string } | { ok: false; message: string };

const refuse = (message: string): NewTestResult => ({ ok: false, message });

export async function createTest(ctx: NewTestContext): Promise<NewTestResult> {
  const tree = ctx.tree;
  if (!tree) return refuse(t('u2Tests.new.noProgram'));
  const files: string[] = [];
  const collect = (node: FileTreeNode): void => (node.type === 'file' ? void files.push(node.path) : node.children?.forEach(collect));
  collect(tree);
  const programPath = entryProgramPath(ctx.config, files);
  const language = programPath === null ? undefined : findFileInTree(tree, programPath)?.language;
  if (programPath === null || language === undefined || language === 'SCENARIO') return refuse(t('u2Tests.new.noProgram'));
  const stem = programPath.slice(programPath.lastIndexOf('/') + 1).replace(/(\.(?:ld|fbd|sfc))?\.[^.]+$/i, '');

  // the outputs come from building the program alone: the debug map names each one with its type and its memory region
  const source = await ctx.read(programPath);
  let map: ReturnType<typeof compileSingleFileWithTask>['debugMap'];
  try {
    if (source === null) throw new Error('unreadable');
    map = compileSingleFileWithTask(source, language as PLCLanguage, { programName: stem }).debugMap;
  } catch {
    return refuse(t('u2Tests.new.noBuild', { program: stem }));
  }
  const program = Object.entries(map.pou).find(([, pou]) => pou.type === 'PROGRAM');
  const name = program?.[0] ?? stem;
  const output = Object.entries(program?.[1].vars ?? {}).find(
    ([, variable]) => variable.type === 'BOOL' && variable.region === 'OPI' && variable.scope !== 'global',
  );
  if (!output) return refuse(t('u2Tests.new.noBool', { program: name }));

  const folder = findFileInTree(tree, TESTS_FOLDER);
  const taken = new Set((folder?.type === 'directory' ? (folder.children ?? []) : []).map((child) => child.name.toLowerCase()));
  let id = name;
  for (let number = 2; taken.has(`${id}${SUFFIX}`.toLowerCase()); number++) id = `${name}_${number}`;
  const signal = `${name}.${output[0]}`;
  const scenario = {
    schemaVersion: 1,
    id,
    tickMs: 10,
    durationMs: 1000,
    events: [],
    expectations: [{ kind: 'AT', atMs: 0, condition: { [signal]: false } }],
  };
  try {
    compileScenario(scenario, map);
  } catch {
    return refuse(t('u2Tests.new.noBuild', { program: name }));
  }

  if (!folder) await ctx.createFolder('', TESTS_FOLDER);
  const fileName = `${id}${SUFFIX}`;
  const fileId = await ctx.createFile(fileName, 'SCENARIO', TESTS_FOLDER, `${JSON.stringify(scenario, null, 2)}\n`);
  return { ok: true, path: `${TESTS_FOLDER}/${fileName}`, id, fileId, signal };
}
