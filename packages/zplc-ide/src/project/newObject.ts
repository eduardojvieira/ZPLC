/**
 * Creating an object of the project from the navigator (SHL-013): the skeleton of each kind, the rules for its name, and the
 * steps that put it in the project. The store's own operations do the I/O; they come in through `CreateContext`.
 */
import { t } from '../i18n';
import { createEmptyFileContent, type PLCLanguage, type TaskDefinition } from '../types';
import { fileNameForNewFile } from '../utils/fileSystem';

export const OBJECT_KINDS = ['program', 'functionBlock', 'function', 'dataType', 'globals', 'task'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Words of Structured Text that cannot be a name (the declaration and control words a skeleton or a program uses). */
const RESERVED = new Set(
  (
    'PROGRAM END_PROGRAM FUNCTION END_FUNCTION FUNCTION_BLOCK END_FUNCTION_BLOCK TYPE END_TYPE STRUCT END_STRUCT VAR END_VAR ' +
    'VAR_INPUT VAR_OUTPUT VAR_IN_OUT VAR_GLOBAL VAR_EXTERNAL VAR_TEMP CONSTANT RETAIN IF THEN ELSE ELSIF END_IF CASE OF END_CASE ' +
    'FOR TO BY DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT EXIT RETURN TRUE FALSE AND OR XOR NOT MOD AT ARRAY'
  ).split(' '),
);

/** Why `name` cannot name a new object, in words for the person that say what was typed; null when it can. */
export function objectNameProblem(name: string, taken: ReadonlySet<string>): string | null {
  const typed = name.trim();
  if (typed === '') return t('newObject.name.empty');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(typed) || typed.endsWith('_') || typed.includes('__') || RESERVED.has(typed.toUpperCase())) {
    return t('newObject.name.invalid', { name: typed });
  }
  if (typed.length > 63) return t('newObject.name.long', { name: typed });
  if (taken.has(typed.toLowerCase())) return t('newObject.name.taken', { name: typed });
  return null;
}

export interface CreateContext {
  /** The names in use, lower-cased: declarations, global variables and file names of the project. */
  takenNames: ReadonlySet<string>;
  /** The program files a task can run, under the name a task gives them. */
  programFiles: readonly string[];
  tasks: () => readonly TaskDefinition[];
  /** Creates the file with this content, saved, and returns its path. The file opens as it is born, so it never holds less. */
  createFile: (fileName: string, language: PLCLanguage, content: string) => Promise<string>;
  setTasks: (tasks: TaskDefinition[]) => void | Promise<void>;
  /** Shows the object at its declaration. */
  open: (path: string, line: number) => Promise<void>;
}

/** The text of a program in `language`, named `name`: the skeleton of the New File dialog with the program's name in it. */
function programSkeleton(language: PLCLanguage, name: string): string {
  const content = createEmptyFileContent(language);
  if (language === 'ST' || language === 'IL') return content.replaceAll('NewProgram', name);
  const diagram = JSON.parse(content) as { name?: string };
  return JSON.stringify({ ...diagram, name }, null, 2);
}

/** The file text of a kind, and the line of its declaration. Not a program: Structured Text only. */
function textSkeleton(kind: Exclude<ObjectKind, 'program' | 'task'>, name: string): { content: string; line: number } {
  switch (kind) {
    case 'functionBlock':
      return {
        content:
          `FUNCTION_BLOCK ${name}\nVAR_INPUT\n    Enable : BOOL;\nEND_VAR\nVAR_OUTPUT\n    Q : BOOL;\nEND_VAR\n\nQ := ` +
          `Enable;\n\nEND_FUNCTION_BLOCK\n`,
        line: 1,
      };
    case 'function':
      return { content: `FUNCTION ${name} : INT\nVAR_INPUT\n    In : INT;\nEND_VAR\n\n${name} := In;\n\nEND_FUNCTION\n`, line: 1 };
    case 'dataType':
      return { content: `TYPE ${name} :\nSTRUCT\n    Value : INT;\nEND_STRUCT\nEND_TYPE\n`, line: 1 };
    case 'globals':
      return { content: `VAR_GLOBAL\n    ${name} : INT;\nEND_VAR\n`, line: 2 };
  }
}

/** Creates the object, saves it, and opens it. A refused name changes nothing and says so in a message that names it. */
export async function createObject(
  kind: ObjectKind,
  language: PLCLanguage,
  name: string,
  ctx: CreateContext,
): Promise<{ path: string; line: number }> {
  const typed = name.trim();
  if (kind === 'task') {
    const taken = new Set(ctx.tasks().map((task) => task.name.toLowerCase()));
    const problem = objectNameProblem(typed, taken);
    if (problem) throw new Error(problem);
    const row: TaskDefinition = { name: typed, trigger: 'cyclic', interval_ms: 100, priority: 5, programs: ctx.programFiles.slice(0, 1) };
    await ctx.setTasks([...ctx.tasks(), row]);
    const created = { path: 'zplc.json', line: 1 };
    await ctx.open(created.path, created.line);
    return created;
  }
  const problem = objectNameProblem(typed, ctx.takenNames);
  if (problem) throw new Error(problem);
  const lang: PLCLanguage = kind === 'program' ? language : 'ST';
  const fileName = fileNameForNewFile(typed, lang);
  const { content, line } = kind === 'program' ? { content: programSkeleton(lang, typed), line: 1 } : textSkeleton(kind, typed);
  const path = await ctx.createFile(fileName, lang, content);
  await ctx.open(path, line);
  return { path, line };
}

/** The tasks with the task at `index` renamed in place (its programs stay); a name that is not free is refused with a message. */
export function renameTaskRow(tasks: readonly TaskDefinition[], index: number, name: string): TaskDefinition[] {
  const typed = name.trim();
  const others = new Set(tasks.filter((_, at) => at !== index).map((task) => task.name.toLowerCase()));
  const problem = objectNameProblem(typed, others);
  if (problem) throw new Error(problem);
  return tasks.map((task, at) => (at === index ? { ...task, name: typed } : task));
}
