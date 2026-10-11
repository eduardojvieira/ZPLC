/**
 * Rename symbol (LNG-016): the edits that rename what a name at a position stands for, in every file of the project.
 *
 * It is not a search and replace. The references come from the project index, which resolves each name by scope and
 * by type, so a variable of one program is renamed without touching the variable of the same name in another, and a
 * member of a block is renamed where it is read through an instance of the block or of one that extends it. The
 * rename is refused, with the reason, when it could change what a name means: the new name is already declared in a
 * scope where the symbol is used, a file of the project has a syntax error and could hold a reference that was not
 * found, or the symbol is not the project's.
 */

import { tokenize, TokenType } from '@zplc/compiler';
import type { IndexedSymbol, ProjectIndex } from './projectIndex';

export interface RenameEdit {
  file: string;
  line: number;
  column: number;
  length: number;
  newText: string;
}

export type RenamePreparation =
  | { ok: true; symbol: IndexedSymbol; line: number; column: number; length: number; placeholder: string }
  | { ok: false; reason: string };

export type RenameResult =
  | { ok: true; symbol: IndexedSymbol; edits: RenameEdit[]; files: string[] }
  | { ok: false; reason: string };

/** Whether `name` is one identifier of the language: a letter or underscore, then letters, digits and underscores, and no keyword. */
export function isRenameableName(name: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  try {
    const tokens = tokenize(name);
    return tokens.length === 2 && tokens[0]!.type === TokenType.IDENTIFIER;
  } catch {
    return false;
  }
}

/** The symbol and range a rename at the position would act on, or why it cannot be renamed. */
export function prepareRename(index: ProjectIndex, file: string, line: number, column: number): RenamePreparation {
  const reference = index.referenceAt(file, line, column);
  if (!reference) return { ok: false, reason: 'There is no name at this position.' };
  if (reference.builtin) return { ok: false, reason: `${reference.builtin.name} is part of the standard library and cannot be renamed.` };
  const symbol = index.symbol(reference.symbol);
  if (!symbol) return { ok: false, reason: 'This name is not declared in the project, so there is nothing to rename.' };
  if (symbol.kind === 'program') {
    return { ok: false, reason: `${symbol.name} is a program: the tasks of zplc.json run it by name, so rename it there and in its file together.` };
  }
  return { ok: true, symbol, line: reference.line, column: reference.column, length: reference.length, placeholder: symbol.name };
}

/** The names, in upper case, that already mean something in a scope where `symbol` is used. */
function taken(index: ProjectIndex, scope: number, symbol: IndexedSymbol): Set<string> {
  const names = new Set<string>();
  const add = (other: IndexedSymbol): void => { if (other.id !== symbol.id) names.add(other.name.toUpperCase()); };
  for (const local of index.localsVisibleFrom(scope)) add(local);
  for (const global of index.globalSymbols()) add(global);
  for (const top of index.topLevelSymbols()) add(top);
  return names;
}

export function renameSymbol(index: ProjectIndex, file: string, line: number, column: number, newName: string): RenameResult {
  const prepared = prepareRename(index, file, line, column);
  if (!prepared.ok) return prepared;
  const { symbol } = prepared;
  if (!isRenameableName(newName)) return { ok: false, reason: `'${newName}' is not a valid name: use letters, digits and underscores, not starting with a digit, and not a keyword.` };
  if (newName === symbol.name) return { ok: false, reason: 'The new name is the same as the old one.' };
  if (index.broken.length > 0) {
    const names = index.broken.slice(0, 3).join(', ');
    return { ok: false, reason: `Rename needs every file of the project to be read, and ${names}${index.broken.length > 3 ? ' and others have' : index.broken.length > 1 ? ' have' : ' has'} a syntax error. Fix ${index.broken.length > 1 ? 'them' : 'it'} first.` };
  }

  const references = index.referencesTo(symbol.id);
  const key = newName.toUpperCase();
  const sameNameIsOnlyTheCaseChanged = key === symbol.name.toUpperCase();
  if (!sameNameIsOnlyTheCaseChanged) {
    // the name must not already mean something in any scope the symbol is used in: it would change what the use resolves to
    const scopes = new Set(references.map((reference) => reference.scope));
    for (const scope of scopes) {
      if (taken(index, scope, symbol).has(key)) {
        const where = index.symbol(scope);
        return { ok: false, reason: `'${newName}' is already declared where ${symbol.name} is used${where ? ` (in ${where.name})` : ''}; renaming would make one of them mean the other.` };
      }
    }
    // a member: the block that declares it, the blocks that extend that block, and the structure it is a field of
    const owner = index.symbol(symbol.container);
    if (owner && ['functionBlock', 'interface', 'struct', 'enum', 'method', 'function', 'program'].includes(owner.kind)) {
      const family = owner.kind === 'functionBlock' || owner.kind === 'interface'
        ? [...index.blockChain(owner.id), ...index.topLevelSymbols().filter((candidate) => candidate.kind === 'functionBlock' && index.blockChain(candidate.id).some((base) => base.id === owner.id))]
        : [owner];
      for (const member of family.flatMap((each) => index.membersOfSymbol(each.id))) {
        if (member.id !== symbol.id && member.name.toUpperCase() === key) {
          return { ok: false, reason: `'${newName}' is already a member of ${index.symbol(member.container)?.name ?? 'the same declaration'}.` };
        }
      }
    }
  }

  const edits = references
    .map((reference): RenameEdit => ({ file: reference.file, line: reference.line, column: reference.column, length: reference.length, newText: newName }))
    .sort((first, second) => (first.file < second.file ? -1 : first.file > second.file ? 1 : 0) || first.line - second.line || first.column - second.column);
  return { ok: true, symbol, edits, files: [...new Set(edits.map((edit) => edit.file))] };
}

/** `text` with the edits of one file applied; the edits do not overlap. */
export function applyRenameEdits(text: string, edits: readonly RenameEdit[]): string {
  const lines = text.split('\n');
  const ordered = [...edits].sort((first, second) => second.line - first.line || second.column - first.column);
  for (const edit of ordered) {
    const row = lines[edit.line - 1];
    if (row === undefined) continue;
    lines[edit.line - 1] = row.slice(0, edit.column - 1) + edit.newText + row.slice(edit.column - 1 + edit.length);
  }
  return lines.join('\n');
}
