/**
 * The reference index (plan-u2.md, Task R2; FND-004): every place a name or an I/O address is written, across Structured
 * Text, Instruction List, Ladder, FBD, SFC, the I/O mapping of `zplc.json`, the Watch table and the test scenarios.
 *
 * Pure over the text of the project: no store, no build. The Structured Text occurrences come from the language service's
 * `ProjectIndex`; the others from the walkers of this folder. A name resolves by the scope rules of `ProjectIndex`: a
 * diagram's tables first, then the project's globals, and a local of an ST or IL program is only that program's.
 *
 * How `zplc.json` rows bind to program variables: by address only. The build maps any variable declared `AT %I...` to
 * the image whatever its name (`runtime/declaredInputs.ts`) and the board check reads the rows by address
 * (`boards/safeOutputs.ts`), so a row's `name` is a label. A row is therefore always a `binding` of its address, and
 * also an occurrence of a symbol when a symbol of the same name is declared with that address.
 */
import { TokenType } from '@zplc/compiler';
import type { ProjectIndex } from '../langsvc/projectIndex';
import type { SourceElementId } from '../models/sourceElements';
import type { ZPLCProjectConfig } from '../types';
import { canonicalAddress, parseAddress, sameAddress } from './addresses';
import {
  REFERENCE_LIMITS,
  type Language,
  type NormalizedAddress,
  type Occurrence,
  type Place,
  type RefTarget,
  type References,
} from './contracts';
import { diagramOccurrences } from './diagramText';
import { ilOccurrences } from './ilText';

export interface ReferenceInput {
  /** The Structured Text of the project, indexed with the open buffers in place. */
  st: ProjectIndex;
  files: ReadonlyArray<{ path: string; language: string; content: string }>;
  config: ZPLCProjectConfig | null;
  /** The rows of the Watch table: `Program.Variable` paths. */
  watch: readonly string[];
  scenarios: ReadonlyArray<{ path: string; content: string }>;
}
export interface ReferenceIndex {
  /** The target a place names: a text position, an element and its field, a table or I/O row, a watch path. */
  targetAt(place: Place): RefTarget | undefined;
  referencesOf(target: RefTarget): References;
  /** The names (that resolve to something) an element carries, in the order written. */
  namesOfElement(file: string, element: SourceElementId): string[];
}

interface Entry {
  key: string;
  target: RefTarget;
  occurrence: Occurrence;
}

const symbolKey = (scope: string, name: string): string => `s|${scope}|${name.toUpperCase()}`;
const addressKey = (address: NormalizedAddress): string => `a|${canonicalAddress(address)}`;
const keyOf = (target: RefTarget): string => (target.kind === 'symbol' ? symbolKey(target.scope, target.name) : addressKey(target.address));
/** The order a definition is looked for in: text first, then diagram tables, then the I/O mapping. */
const RANK: Record<Language, number> = { ST: 0, IL: 1, LD: 2, FBD: 2, SFC: 2, IO: 3, WATCH: 4, SCENARIO: 5 };
const baseField = (field: string): string => field.replace(/:\d+(:\d+)?$/, '');
const sameText = (a: Place, b: Place): boolean => a.kind === 'text' && b.kind === 'text' && a.file === b.file && a.line === b.line;
const covers = (place: Place, line: number, column: number): boolean =>
  place.kind === 'text' && place.line === line && column >= place.column && column <= place.column + place.length;

const programName = (path: string): string => (path.split('/').pop() ?? path).replace(/\.(ld|fbd|sfc)\.json$/i, '').replace(/\.[^.]+$/, '');
/** The scope of the locals of an IL file: its `PROGRAM` (or block) name, else the file. */
function ilScope(path: string, content: string): { scope: string; program: string } {
  const unit = /^\s*(?:PROGRAM|FUNCTION_BLOCK|FUNCTION)\s+([A-Za-z_]\w*)/im.exec(content);
  return unit ? { scope: `${path}#${unit[1]}`, program: unit[1]! } : { scope: path, program: programName(path) };
}

export function buildReferenceIndex(input: ReferenceInput): ReferenceIndex {
  const entries: Entry[] = [];
  const broken = new Set<string>(input.st.broken);
  /** The keys of every declared symbol, and the address each was declared with. */
  const declared = new Set<string>();
  const addressOf = new Map<string, NormalizedAddress>();
  const programs = new Map<string, string>();
  const globals = (name: string): boolean => declared.has(symbolKey('', name));

  const add = (target: RefTarget, occurrence: Occurrence): void => {
    entries.push({ key: keyOf(target), target, occurrence });
  };
  const symbol = (scope: string, name: string, occurrence: Occurrence): void => {
    if (occurrence.role === 'declaration') declared.add(symbolKey(scope, name));
    add({ kind: 'symbol', scope, name }, occurrence);
  };
  const bind = (scope: string, name: string, text: string): NormalizedAddress | undefined => {
    const address = parseAddress(text);
    if (address && name) addressOf.set(symbolKey(scope, name), address);
    return address;
  };

  // --- Structured Text: the index resolved every name already.
  const scopeOf = (id: number): { scope: string; name: string } | undefined => {
    const found = input.st.symbol(id);
    if (!found) return undefined;
    const container = input.st.symbol(found.container);
    // a VAR_EXTERNAL names the global of the same name
    const external = found.kind === 'external' && input.st.globalSymbols().some((g) => g.name.toUpperCase() === found.name.toUpperCase());
    return { scope: container && !external ? `${container.file}#${container.name}` : '', name: found.name };
  };
  for (const found of input.st.symbols) {
    if (found.kind === 'program') programs.set(found.name.toUpperCase(), `${found.file}#${found.name}`);
  }
  for (const file of input.st.files.values()) {
    for (const ref of file.references) {
      const owner = scopeOf(ref.symbol);
      if (!owner) continue;
      const place: Place = { kind: 'text', file: file.path, line: ref.line, column: ref.column, length: ref.length };
      symbol(owner.scope, owner.name, { language: 'ST', place, role: ref.declaration ? 'declaration' : 'use', text: owner.name });
    }
    // `a, b AT %IX0.0 : BOOL`: the address is a binding of each name before it
    const tokens = input.st.tokensOf(file.path);
    tokens.forEach((token, i) => {
      const io = tokens[i + 1];
      if (token.type !== TokenType.AT || io?.type !== TokenType.IO_ADDRESS) return;
      const address = parseAddress(io.value);
      if (!address) return;
      const place: Place = { kind: 'text', file: file.path, line: io.line, column: io.column, length: io.value.length };
      add({ kind: 'address', address }, { language: 'ST', place, role: 'binding', text: io.value });
      for (let at = i - 1; at >= 0 && tokens[at]!.type === TokenType.IDENTIFIER; at -= 2) {
        const owner = scopeOf(input.st.referenceAt(file.path, tokens[at]!.line, tokens[at]!.column)?.symbol ?? -1);
        if (owner) addressOf.set(symbolKey(owner.scope, owner.name), address);
        if (tokens[at - 1]?.type !== TokenType.COMMA) break;
      }
    });
  }

  // --- Instruction List and diagrams. A name resolves to the file's own declarations, then to the globals.
  const resolve = (scope: string, own: ReadonlySet<string>, name: string): string | undefined =>
    own.has(name.toUpperCase()) ? scope : globals(name) ? '' : undefined;
  const pending: Array<() => void> = [];
  for (const file of input.files) {
    if (file.language === 'IL') {
      const { scope, program } = ilScope(file.path, file.content);
      programs.set(program.toUpperCase(), scope);
      const found = ilOccurrences(file.path, file.content);
      const own = new Set(found.filter((o) => o.role === 'declaration').map((o) => o.text.toUpperCase()));
      let last = '';
      for (const o of found) {
        if (o.role === 'declaration') {
          symbol(scope, o.text, o);
          last = o.text;
        } else if (o.role === 'binding') {
          const address = bind(scope, last, o.text);
          if (address) add({ kind: 'address', address }, o);
        } else pending.push(() => resolveName(scope, own, o));
      }
    } else if (file.language === 'LD' || file.language === 'FBD' || file.language === 'SFC') {
      const { occurrences, declared: tables, ok } = diagramOccurrences({ path: file.path, language: file.language, content: file.content });
      if (!ok) {
        broken.add(file.path);
        continue;
      }
      programs.set(programName(file.path).toUpperCase(), file.path);
      const own = new Set(tables.keys());
      for (const o of occurrences) {
        if (o.place.kind === 'table' && o.role === 'declaration') symbol(file.path, o.text, o);
        else if (o.place.kind === 'table') {
          const address = bind(file.path, o.place.name, o.text);
          if (address) add({ kind: 'address', address }, o);
        } else pending.push(() => resolveName(file.path, own, o));
      }
    }
  }
  function resolveName(scope: string, own: ReadonlySet<string>, o: Occurrence): void {
    const found = resolve(scope, own, o.text);
    if (found !== undefined) add({ kind: 'symbol', scope: found, name: o.text }, o);
  }
  // globals are declared by now, whatever the order of the files
  pending.forEach((run) => run());

  // --- zplc.json: a row binds an address; it is also the symbol of its name when that symbol has that address.
  const rows = [
    ['inputs', input.config?.io?.inputs],
    ['outputs', input.config?.io?.outputs],
    ['virtual', input.config?.io?.virtual],
  ] as const;
  for (const [section, list] of rows) {
    (list ?? []).forEach((row, i) => {
      const address = typeof row?.address === 'string' ? parseAddress(row.address) : undefined;
      if (!address) return;
      const place: Place = { kind: 'config', editor: 'io', row: `${section}[${i}]` };
      add({ kind: 'address', address }, { language: 'IO', place, role: 'binding', text: row.address });
      for (const [key, bound] of addressOf) {
        const [, scope, name] = key.split('|') as [string, string, string];
        if (name === String(row.name).toUpperCase() && sameAddress(bound, address)) {
          add({ kind: 'symbol', scope, name: row.name }, { language: 'IO', place, role: 'binding', text: row.name });
        }
      }
    });
  }

  // --- Watch rows and scenario signals are `Program.Variable` paths (or the name of a global).
  const signal = (path: string, occurrence: Occurrence): void => {
    const [first = '', second = ''] = path.split('.');
    const scope = programs.get(first.toUpperCase());
    if (scope !== undefined && declared.has(symbolKey(scope, second))) add({ kind: 'symbol', scope, name: second }, occurrence);
    else if (globals(second) && scope !== undefined) add({ kind: 'symbol', scope: '', name: second }, occurrence);
    else if (globals(first)) add({ kind: 'symbol', scope: '', name: first }, occurrence);
  };
  for (const path of input.watch) signal(path, { language: 'WATCH', place: { kind: 'watch', path }, role: 'use', text: path });
  for (const file of input.scenarios) {
    let doc: unknown;
    try {
      doc = JSON.parse(file.content);
    } catch {
      broken.add(file.path);
      continue;
    }
    const walk = (value: unknown, pointer: string, via: 'set' | 'condition' | ''): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        const at = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        if (via) {
          const place: Place = { kind: 'scenario', file: file.path, pointer: at };
          signal(key, { language: 'SCENARIO', place, role: via === 'set' ? 'write' : 'use', text: key });
        } else if (key === 'signal' && typeof child === 'string') {
          signal(child, { language: 'SCENARIO', place: { kind: 'scenario', file: file.path, pointer: at }, role: 'use', text: child });
        } else walk(child, at, key === 'set' || key === 'condition' ? key : '');
      }
    };
    walk(doc, '', '');
  }

  const byKey = new Map<string, Entry[]>();
  for (const entry of entries) byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry]);

  const fileOf = (place: Place): string => (place.kind === 'config' ? 'zplc.json' : place.kind === 'watch' ? '' : place.file);
  return {
    referencesOf(target) {
      const found = [...(byKey.get(keyOf(target)) ?? [])].sort((a, b) => RANK[a.occurrence.language] - RANK[b.occurrence.language]);
      const wanted = target.kind === 'symbol' ? 'declaration' : 'binding';
      const first = found.find((e) => e.occurrence.role === wanted);
      const uses: Occurrence[] = [];
      const perFile = new Map<string, number>();
      let truncated = false;
      for (const { occurrence } of found) {
        if (occurrence === first?.occurrence) continue;
        const file = fileOf(occurrence.place);
        const count = perFile.get(file) ?? 0;
        if (uses.length >= REFERENCE_LIMITS.occurrences || count >= REFERENCE_LIMITS.perFile) truncated = true;
        else {
          uses.push(occurrence);
          perFile.set(file, count + 1);
        }
      }
      return { target, ...(first ? { definition: first.occurrence } : {}), uses, truncated, broken: [...broken] };
    },

    targetAt(place) {
      const pick = (match: (e: Entry) => boolean): RefTarget | undefined => entries.find(match)?.target;
      switch (place.kind) {
        case 'text': {
          const ref = input.st.referenceAt(place.file, place.line, place.column);
          if (ref && ref.symbol >= 0) {
            const owner = scopeOf(ref.symbol);
            return owner && { kind: 'symbol', ...owner };
          }
          // an `AT` address, an Instruction List name: the occurrence that covers the position
          return pick(
            (e) =>
              (sameText(e.occurrence.place, place) && covers(e.occurrence.place, place.line, place.column)) ||
              (e.occurrence.place.kind === 'element' &&
                e.occurrence.place.file === place.file &&
                e.occurrence.place.element === `line:${place.line}` &&
                covers(
                  {
                    kind: 'text',
                    file: place.file,
                    line: place.line,
                    column: Number(/:(\d+)$/.exec(e.occurrence.place.field)?.[1]),
                    length: e.occurrence.text.length,
                  },
                  place.line,
                  place.column,
                )),
          );
        }
        case 'element':
          return (
            pick(
              (e) =>
                e.occurrence.place.kind === 'element' &&
                e.occurrence.place.file === place.file &&
                e.occurrence.place.element === place.element &&
                e.occurrence.place.field === place.field,
            ) ??
            pick(
              (e) =>
                e.occurrence.place.kind === 'element' &&
                e.occurrence.place.file === place.file &&
                e.occurrence.place.element === place.element &&
                baseField(e.occurrence.place.field) === baseField(place.field),
            )
          );
        case 'table':
          return pick(
            (e) =>
              e.occurrence.place.kind === 'table' &&
              e.occurrence.place.file === place.file &&
              e.occurrence.place.section === place.section &&
              e.occurrence.place.name === place.name &&
              e.occurrence.role === 'declaration',
          );
        case 'config':
          return pick((e) => e.occurrence.place.kind === 'config' && e.occurrence.place.row === place.row && e.target.kind === 'address');
        case 'watch':
          return pick((e) => e.occurrence.place.kind === 'watch' && e.occurrence.place.path === place.path);
        case 'scenario':
          return pick(
            (e) =>
              e.occurrence.place.kind === 'scenario' &&
              e.occurrence.place.file === place.file &&
              e.occurrence.place.pointer === place.pointer,
          );
      }
    },

    namesOfElement(file, element) {
      const names: string[] = [];
      for (const { occurrence: o } of entries) {
        if (o.place.kind === 'element' && o.place.file === file && o.place.element === element && !names.includes(o.text))
          names.push(o.text);
      }
      return names;
    },
  };
}
