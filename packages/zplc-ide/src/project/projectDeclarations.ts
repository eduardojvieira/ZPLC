/**
 * The declarations of a project, read from the compiler's parse of each Structured Text file (IDE-023): the programs,
 * function blocks, functions, interfaces and data types that the project tree lists under their file and that the
 * editors offer. The position of a declaration is the one of its name, so that activating it puts the cursor on it.
 * A file that does not parse declares nothing here: its diagnostics come from the build.
 */
import { parse, tokenize, TokenType } from '@zplc/compiler';

export type DeclarationKind = 'PROGRAM' | 'FUNCTION_BLOCK' | 'FUNCTION' | 'INTERFACE' | 'STRUCT' | 'ENUM' | 'TYPE';

export interface Declaration {
  name: string;
  kind: DeclarationKind;
  /** The project-relative path of the file that declares it. */
  file: string;
  line: number;
  column: number;
}

export interface FileDeclarations { file: string; declarations: Declaration[] }

/** Past this size a file is not parsed here (the live analysis of the editor has the same cap). */
const SOURCE_LIMIT = 200_000;

type Keyword = typeof TokenType.PROGRAM | typeof TokenType.FUNCTION | typeof TokenType.FUNCTION_BLOCK | typeof TokenType.INTERFACE | typeof TokenType.TYPE;

export function declarationsOf(file: string, content: string): Declaration[] {
  if (content.length === 0 || content.length > SOURCE_LIMIT) return [];
  try {
    const unit = parse(content);
    const tokens = tokenize(content);
    const at = (entry: { name: string; line: number; column: number }, kind: DeclarationKind, keyword: Keyword): Declaration | null => {
      const start = tokens.findIndex((token) => token.type === keyword && token.line === entry.line && token.column === entry.column);
      const name = start < 0 ? undefined : tokens.slice(start + 1).find((token) => token.type === TokenType.IDENTIFIER);
      return name ? { name: entry.name, kind, file, line: name.line, column: name.column } : null;
    };
    return [
      ...unit.programs.map((entry) => at(entry, 'PROGRAM', TokenType.PROGRAM)),
      ...unit.functionBlocks.map((entry) => at(entry, 'FUNCTION_BLOCK', TokenType.FUNCTION_BLOCK)),
      ...unit.functions.map((entry) => at(entry, 'FUNCTION', TokenType.FUNCTION)),
      ...unit.interfaces.map((entry) => at(entry, 'INTERFACE', TokenType.INTERFACE)),
      ...unit.typeDefinitions.map((entry) => at(entry, entry.kind === 'StructDecl' ? 'STRUCT' : 'ENUM', TokenType.TYPE)),
      ...(unit.typeAliases ?? []).map((entry) => at(entry, 'TYPE', TokenType.TYPE)),
    ].filter((entry): entry is Declaration => entry !== null).sort((left, right) => left.line - right.line || left.column - right.column);
  } catch {
    return [];
  }
}

/** The declarations of the Structured Text files, grouped by file in path order; files that declare nothing are left out. */
export function projectDeclarations(files: Iterable<{ path: string; content: string; language: string }>): FileDeclarations[] {
  const groups: FileDeclarations[] = [];
  for (const file of files) {
    if (file.language !== 'ST') continue;
    const declarations = declarationsOf(file.path, file.content);
    if (declarations.length > 0) groups.push({ file: file.path, declarations });
  }
  return groups.sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));
}

// ponytail: one list for the whole window. The Monaco providers of the ST language service are registered once, for
// every editor, and have no project to ask; whoever tracks the project's sources (store/projectSources.ts) sets this.
let current: readonly Declaration[] = [];

/** The declarations the editors offer: every function block, function and type of the project's sources. */
export function setProjectDeclarations(declarations: readonly Declaration[]): void {
  current = declarations;
}

export function getProjectDeclarations(): readonly Declaration[] {
  return current;
}
