// The component-kit guard of Studio (UX-002, UX-005, UX-006, UX-026), checked without a new dependency:
//
//   bun tools/ci/ui-kit-guard.ts              check the repository (also run by `bun run lint:ide`)
//   bun tools/ci/ui-kit-guard.ts --write      lower the listed counts that shrank and drop the entries that reached zero
//   bun tools/ci/ui-kit-guard.ts --list       print every violation with its line
//   bun tools/ci/ui-kit-guard.ts --adopt=RULE pin what the sources hold for a rule that was added after the list (once)
//
// Outside packages/zplc-ide/src/ui/ (the kit itself), tests and declaration files, a source of Studio must not use:
//   raw-button, raw-input, raw-select, raw-textarea   a `<button>`, `<input>`, `<select>` or `<textarea>` element (UX-002)
//   title-attribute                                   a `title=` tooltip on an element: the kit Tooltip replaces it (UX-002)
//   native-dialog                                     `confirm`, `alert` or `prompt`: the kit AlertDialog replaces them (UX-002)
//   focus-override                                    a `focus:` or `focus-visible:` outline or ring utility: there is one
//                                                     focus indicator, the global :focus-visible rule (UX-005)
//   small-text                                        a font size under 11px (UX-006)
//   unnamed-control                                   a form control with no programmatically associated label (UX-026)
//   unnamed-icon-button                               a button with no text and no accessible name (UX-026)
//   stock-palette                                     a stock Tailwind palette utility (`bg-red-500`, `text-white`): the themes
//                                                     change tokens, not stock colours (UX-002)
//   literal-colour                                    a hex or rgb() colour written in a source (UX-002, UX-003)
//   editor-effect                                     in the visual editors and the live panels (the controller view, the watch
//                                                     panel, the notification list), a continuous animation or a shadow: no
//                                                     element may glow, pulse or animate continuously (UX-010). A loading
//                                                     spinner may turn when the same class list stops it under reduced motion.
//
// The sources that already break a rule when it was added are on tools/ci/ui-kit-offenders.json, one entry per file and
// rule with the count it had. The list can only shrink: a count above its entry (or a file that is not listed) fails, a
// count below must be lowered (--write does it), and an entry that reached zero must be removed. The visual and code
// editors are listed until their own work package moves them to the kit; the last task of WP-112 empties the list.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';

export const IDE_SRC = 'packages/zplc-ide/src';
const KIT = `${IDE_SRC}/ui/`;
const LIST_PATH = new URL('./ui-kit-offenders.json', import.meta.url);

export const RULES = [
  'raw-button', 'raw-input', 'raw-select', 'raw-textarea', 'title-attribute', 'native-dialog',
  'focus-override', 'small-text', 'unnamed-control', 'unnamed-icon-button', 'stock-palette', 'literal-colour', 'editor-effect',
] as const;
export type Rule = (typeof RULES)[number];

export const REQUIREMENT: Record<Rule, string> = {
  'raw-button': 'UX-002', 'raw-input': 'UX-002', 'raw-select': 'UX-002', 'raw-textarea': 'UX-002', 'title-attribute': 'UX-002',
  'native-dialog': 'UX-002', 'focus-override': 'UX-005', 'small-text': 'UX-006', 'unnamed-control': 'UX-026', 'unnamed-icon-button': 'UX-026',
  'stock-palette': 'UX-002', 'literal-colour': 'UX-002', 'editor-effect': 'UX-010',
};

export interface SourceFile { path: string; text: string }
export interface Violation { file: string; rule: Rule; line: number; snippet: string }
export interface Offender { file: string; rule: Rule; count: number; requirement: string; added: string; reason: string }

/** A source the guard reads: a TypeScript or CSS file of the application that is not the kit, a test or a declaration. */
export const isGuarded = (path: string): boolean =>
  path.startsWith(`${IDE_SRC}/`) && !path.startsWith(KIT) && /\.(?:tsx|css)$/.test(path)
  && !/\.test\.tsx?$/.test(path) && !path.endsWith('.generated.css');

const RAW: Record<string, Rule> = { button: 'raw-button', input: 'raw-input', select: 'raw-select', textarea: 'raw-textarea' };
const KIT_FIELDS = new Set(['TextField', 'NumberField', 'Textarea', 'Select']);
const FOCUS_UTILITY = new RegExp(String.raw`(?:^|[\s'"\`:])(?:focus|focus-visible|focus-within):(?:outline-(?:none|hidden|\d|\[|offset|white|black|[a-z]+-\d)|` + String.raw`ring(?:-\d|-\[|-offset|-[a-z]+-\d|\s|$|['"\`]))`);
const SMALL_TEXT = /\btext-\[(\d+(?:\.\d+)?)px\]/g;
const STOCK_HUES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border|ring|outline|shadow|from|via|to|fill|stroke|divide|decoration|accent|caret|placeholder';
const STOCK_PALETTE = new RegExp(`(?<![\\w-])(?:${UTILITY})-(?:(?:${STOCK_HUES})-\\d{2,3}|white|black)(?![\\w-])`, 'g');
const LITERAL_COLOUR = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])|\b(?:rgba?|hsla?)\(/g;
const EDITOR_EFFECT = /(?<![\w-])(?:animate-(?:pulse|ping|bounce|spin)|drop-shadow(?:-[\w[\]#().]+)?|shadow(?:-[a-z0-9]+)?|motion-safe:animate-\w+)(?![\w-])/g;
const LIVE_PANELS = ['ControllerView', 'DebugWatchPanel', 'NotificationsList'].map((name) => `${IDE_SRC}/components/${name}.tsx`);
const isEditorSource = (path: string): boolean => path.startsWith(`${IDE_SRC}/editors/`) || LIVE_PANELS.includes(path);
const MIN_FONT_PX = 11;

function jsxName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function attributeNamed(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name);
}

const hasSpread = (node: ts.JsxOpeningLikeElement): boolean => node.attributes.properties.some((property) => ts.isJsxSpreadAttribute(property));

/** The text a string-valued attribute holds, or the source of its expression. */
function attributeText(attribute: ts.JsxAttribute | undefined): string | undefined {
  const initializer = attribute?.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) return initializer.expression.getText();
  return undefined;
}

/** True when an element, as written, renders text anywhere inside it: a text child, or an expression that may be one. */
function hasContent(element: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment): boolean {
  if (ts.isJsxSelfClosingElement(element)) return false;
  return element.children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== '';
    if (ts.isJsxExpression(child)) return child.expression !== undefined;
    return hasContent(child as ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment);
  });
}

export function violationsOf(file: SourceFile): Violation[] {
  if (file.path.endsWith('.css')) {
    const found: Violation[] = [];
    const uncommented = file.text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    uncommented.split('\n').forEach((line, index) => {
      for (const [, size] of line.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
        if (Number.parseFloat(size) < MIN_FONT_PX) found.push({ file: file.path, rule: 'small-text', line: index + 1, snippet: line.trim().slice(0, 80) });
      }
      for (const _match of line.matchAll(LITERAL_COLOUR)) found.push({ file: file.path, rule: 'literal-colour', line: index + 1, snippet: line.trim().slice(0, 80) });
    });
    return found;
  }

  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Violation[] = [];
  const add = (node: ts.Node, rule: Rule): void => {
    found.push({ file: file.path, rule, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, snippet: node.getText().replace(/\s+/g, ' ').slice(0, 80) });
  };

  // `htmlFor` expressions of the file, to recognise a control whose label is another element's `htmlFor={id}`.
  const labelledIds = new Set<string>();
  const collect = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ['label', 'Field'].includes(jsxName(node))) {
      const target = attributeText(attributeNamed(node, 'htmlFor'));
      if (target !== undefined) labelledIds.add(target);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const visit = (node: ts.Node, ancestors: readonly string[]): void => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
    let nextAncestors = ancestors;
    if (opening) {
      const name = jsxName(opening);
      const intrinsic = /^[a-z]/.test(name);
      if (intrinsic && RAW[name]) {
        add(opening, RAW[name]);
        if (name === 'button') {
          const named = attributeNamed(opening, 'aria-label') || attributeNamed(opening, 'aria-labelledby') || attributeNamed(opening, 'title') || hasSpread(opening);
          if (!named && !hasContent(node as ts.JsxElement)) add(opening, 'unnamed-icon-button');
        } else {
          const type = attributeText(attributeNamed(opening, 'type'));
          const id = attributeText(attributeNamed(opening, 'id'));
          const named = type === 'hidden' || attributeNamed(opening, 'aria-label') || attributeNamed(opening, 'aria-labelledby')
            || ancestors.includes('label') || ancestors.includes('Field') || (id !== undefined && labelledIds.has(id)) || hasSpread(opening);
          if (!named) add(opening, 'unnamed-control');
        }
      }
      if (intrinsic && name !== 'svg' && attributeNamed(opening, 'title')) add(attributeNamed(opening, 'title')!, 'title-attribute');
      if (KIT_FIELDS.has(name) && !attributeNamed(opening, 'label') && !attributeNamed(opening, 'aria-label') && !attributeNamed(opening, 'aria-labelledby') && !ancestors.includes('Field') && !hasSpread(opening)) {
        add(opening, 'unnamed-control');
      }
      if ((name === 'Checkbox' || name === 'Switch') && !attributeNamed(opening, 'label') && !hasSpread(opening)) add(opening, 'unnamed-control');
      if (name === 'IconButton' && !attributeNamed(opening, 'label') && !hasSpread(opening)) add(opening, 'unnamed-icon-button');
      nextAncestors = [...ancestors, name];
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const global = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) && ['window', 'globalThis'].includes(callee.expression.getText()) ? callee.name.text : undefined;
      if (global === 'confirm' || global === 'alert' || global === 'prompt') add(node, 'native-dialog');
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const text = node.text;
      if (FOCUS_UTILITY.test(text) || /(?:^|\s)outline-none(?:\s|$)/.test(text)) add(node, 'focus-override');
      for (const [, size] of text.matchAll(SMALL_TEXT)) if (Number.parseFloat(size) < MIN_FONT_PX) add(node, 'small-text');
      for (const _match of text.matchAll(STOCK_PALETTE)) add(node, 'stock-palette');
      for (const _match of text.matchAll(LITERAL_COLOUR)) add(node, 'literal-colour');
      if (isEditorSource(file.path)) {
        for (const [effect] of text.matchAll(EDITOR_EFFECT)) {
          if (effect === 'animate-spin' && text.includes('motion-reduce:animate-none')) continue;
          add(node, 'editor-effect');
        }
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText() === 'fontSize' && ts.isNumericLiteral(node.initializer) && Number(node.initializer.text) < MIN_FONT_PX) add(node, 'small-text');
    ts.forEachChild(node, (child) => visit(child, nextAncestors));
  };
  visit(source, []);
  return found;
}

export interface GuardOptions { offenders: Offender[] }

const key = (file: string, rule: string): string => `${file}\u0000${rule}`;

export function checkKit(files: readonly SourceFile[], options: GuardOptions): string[] {
  const problems: string[] = [];
  const counts = new Map<string, number>();
  const listed = new Map(options.offenders.map((entry) => [key(entry.file, entry.rule), entry] as const));
  for (const file of files.filter((item) => isGuarded(item.path))) {
    for (const violation of violationsOf(file)) counts.set(key(file.path, violation.rule), (counts.get(key(file.path, violation.rule)) ?? 0) + 1);
  }
  for (const [id, count] of [...counts].sort(([left], [right]) => left.localeCompare(right))) {
    const [file, rule] = id.split('\u0000') as [string, Rule];
    const entry = listed.get(id);
    const requirement = REQUIREMENT[rule];
    if (!entry) problems.push(`${requirement}: ${file} has ${count} ${rule} violation${count === 1 ? '' : 's'}; use the kit (src/ui) instead; the list of offenders can only shrink`);
    else if (count > entry.count) problems.push(`${requirement}: ${file} grew from ${entry.count} to ${count} ${rule} violations; a file on tools/ci/ui-kit-offenders.json can only shrink`);
    else if (count < entry.count) problems.push(`${requirement}: ${file} now has ${count} ${rule} violations, recorded ${entry.count}; lower the entry (bun tools/ci/ui-kit-guard.ts --write)`);
  }
  for (const entry of options.offenders) {
    if (!counts.has(key(entry.file, entry.rule))) problems.push(`${entry.requirement}: ${entry.file} has no ${entry.rule} violation any more; remove the entry (bun tools/ci/ui-kit-guard.ts --write)`);
  }
  return problems;
}

/** The list as it should be after work on the sources: counts lowered to what the files hold now, zero counts dropped. */
export function ratchetOffenders(files: readonly SourceFile[], offenders: readonly Offender[]): Offender[] {
  const counts = new Map<string, number>();
  for (const file of files.filter((item) => isGuarded(item.path))) {
    for (const violation of violationsOf(file)) counts.set(key(file.path, violation.rule), (counts.get(key(file.path, violation.rule)) ?? 0) + 1);
  }
  return offenders.flatMap((entry) => {
    const count = counts.get(key(entry.file, entry.rule)) ?? 0;
    return count === 0 ? [] : [{ ...entry, count: Math.min(count, entry.count) }];
  });
}

export function readSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (path: string): void => {
    if (statSync(join(root, path)).isDirectory()) for (const name of readdirSync(join(root, path)).sort()) walk(posix.join(path, name));
    else if (/\.(?:tsx|css)$/.test(path)) files.push({ path, text: readFileSync(join(root, path), 'utf8') });
  };
  if (existsSync(join(root, IDE_SRC))) walk(IDE_SRC);
  return files;
}

export function readOffenders(): Offender[] {
  return existsSync(LIST_PATH) ? JSON.parse(readFileSync(LIST_PATH, 'utf8')) as Offender[] : [];
}

export function checkRepository(root = resolve(dirname(new URL(import.meta.url).pathname), '../..')): string[] {
  return checkKit(readSources(root), { offenders: readOffenders() });
}

if (import.meta.main) {
  const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
  const files = readSources(root);
  if (process.argv.includes('--list')) {
    for (const file of files.filter((item) => isGuarded(item.path))) for (const violation of violationsOf(file)) console.log(`${violation.file}:${violation.line} ${violation.rule} ${violation.snippet}`);
  }
  if (process.argv.includes('--seed')) {
    if (readOffenders().length > 0) { console.error('ui-kit-guard: the list exists; it only shrinks (--write)'); process.exit(1); }
    const counts = new Map<string, number>();
    for (const file of files.filter((item) => isGuarded(item.path))) for (const violation of violationsOf(file)) counts.set(key(file.path, violation.rule), (counts.get(key(file.path, violation.rule)) ?? 0) + 1);
    const seeded: Offender[] = [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([id, count]) => {
      const [file, rule] = id.split('\u0000') as [string, Rule];
      return { file, rule, count, requirement: REQUIREMENT[rule], added: new Date().toISOString().slice(0, 10), reason: 'Not yet moved to the component kit; the surface\'s own work package replaces it.' };
    });
    writeFileSync(LIST_PATH, `${JSON.stringify(seeded, null, 2)}\n`);
  } else if (process.argv.some((argument) => argument.startsWith('--adopt='))) {
    // A rule added after the list was created: pin what the sources hold now for that rule only, once.
    const adopted = process.argv.find((argument) => argument.startsWith('--adopt='))!.slice('--adopt='.length).split(',') as Rule[];
    const current = readOffenders();
    for (const rule of adopted) {
      if (!RULES.includes(rule)) { console.error(`ui-kit-guard: ${rule} is not a rule`); process.exit(1); }
      if (current.some((entry) => entry.rule === rule)) { console.error(`ui-kit-guard: ${rule} is already on the list; it only shrinks (--write)`); process.exit(1); }
    }
    const counts = new Map<string, number>();
    for (const file of files.filter((item) => isGuarded(item.path))) {
      for (const violation of violationsOf(file)) if (adopted.includes(violation.rule)) counts.set(key(file.path, violation.rule), (counts.get(key(file.path, violation.rule)) ?? 0) + 1);
    }
    const added: Offender[] = [...counts].sort(([left], [right]) => left.localeCompare(right)).map(([id, count]) => {
      const [file, rule] = id.split('\u0000') as [string, Rule];
      return { file, rule, count, requirement: REQUIREMENT[rule], added: new Date().toISOString().slice(0, 10), reason: 'Not yet moved to the component kit and the tokens; the surface\'s own work package replaces it.' };
    });
    writeFileSync(LIST_PATH, `${JSON.stringify([...current, ...added], null, 2)}\n`);
  } else if (process.argv.includes('--write')) {
    writeFileSync(LIST_PATH, `${JSON.stringify(ratchetOffenders(files, readOffenders()), null, 2)}\n`);
  }
  const problems = checkRepository(root);
  if (problems.length > 0) {
    console.error(problems.map((problem) => `ui-kit-guard: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`ui-kit-guard: ok (${readOffenders().length} file and rule entries are listed, ${relative(root, LIST_PATH.pathname)})`);
}
