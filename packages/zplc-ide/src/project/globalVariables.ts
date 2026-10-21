/**
 * The global variables a Structured Text file declares in its `VAR_GLOBAL` blocks, for the project navigator (UX-012).
 * Like the declarations (`projectDeclarations.ts`), the position is the one of the declaration in the compiler's parse,
 * and a file that does not parse declares nothing here: its diagnostics come from the build.
 */
import { parse } from '@zplc/compiler';

export interface GlobalVariable {
  name: string;
  /** The project-relative path of the file that declares it. */
  file: string;
  line: number;
  column: number;
  constant: boolean;
}

/** Past this size a file is not parsed here (the declarations and the live analysis have the same cap). */
const SOURCE_LIMIT = 200_000;

export function globalVariablesOf(file: string, content: string): GlobalVariable[] {
  if (content.length === 0 || content.length > SOURCE_LIMIT) return [];
  try {
    return parse(content).globalVars.flatMap((block) =>
      block.variables.map((variable) => ({
        name: variable.name,
        file,
        line: variable.line,
        column: variable.column,
        constant: block.isConstant,
      })),
    );
  } catch {
    return [];
  }
}

/** The global variables of the Structured Text files, in path order and then in the order of the file. */
export function projectGlobalVariables(files: Iterable<{ path: string; content: string; language: string }>): GlobalVariable[] {
  const found: GlobalVariable[] = [];
  for (const file of files) if (file.language === 'ST') found.push(...globalVariablesOf(file.path, file.content));
  return found.sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0) || left.line - right.line);
}
