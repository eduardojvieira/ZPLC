// The design-token checks of Studio (UX-003, UX-005, UX-007, UX-024, UX-032).
//
//   bun tools/ci/ux-tokens.ts            check the repository (also run by `bun run lint:ide`)
//   bun tools/ci/ux-tokens.ts --write    regenerate tokens.generated.css and the generated parts of DESIGN.md
//   bun tools/ci/ux-tokens.ts --ratios   print every contrast pair with its ratio in the three themes
//
// What fails:
//   - src/theme/tokens.generated.css and src/ui/gallery/scopes.generated.css are not what src/theme/tokens.ts renders (the
//     stylesheets cannot drift from the source);
//   - DESIGN.md differs from its generated front matter and token tables (the document cannot drift from the source);
//   - a `var(--name)` of the sources names a token that neither tokens.ts nor the same file defines (UX-003: every token
//     used is defined);
//   - a declared foreground and background pair falls under WCAG 2.2 AA in the light, dark or high-contrast theme (UX-024).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

import { applyGeneratedParts } from '../../packages/zplc-ide/src/theme/designDoc';
import { renderScopesCss, renderTokensCss } from '../../packages/zplc-ide/src/theme/tokensCss';
import { CONTRAST_PAIRS, THEME_IDS, TOKEN_NAMES, TOKENS, contrastResults } from '../../packages/zplc-ide/src/theme/tokens';

const ROOT = resolve(import.meta.dir, '../..');
export const CSS_FILE = 'packages/zplc-ide/src/theme/tokens.generated.css';
export const SCOPES_FILE = 'packages/zplc-ide/src/ui/gallery/scopes.generated.css';
export const DESIGN_FILE = 'packages/zplc-ide/DESIGN.md';
const SOURCE_FOLDERS = ['packages/zplc-ide/src', 'packages/zplc-ide/index.html'];
/** Custom properties that a third-party stylesheet or the utility framework defines. */
const FOREIGN = /^--(?:tw|xy|vscode|monaco)-/;

export interface SourceFile {
  path: string;
  text: string;
}

const TOKEN_USE = /var\(\s*(--[\w-]*\w)\s*[,)]/g;
const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** The `var(--x)` uses of a source file that name no token and no custom property the file declares itself. */
export function undefinedTokens(file: SourceFile, known: ReadonlySet<string> = TOKEN_NAMES): string[] {
  const declared = new Set<string>();
  for (const [, name] of file.text.matchAll(/(?:^|[\s{;'"`])(--[\w-]*\w)\s*(?::|['"`]\s*:)/g)) declared.add(name);
  for (const [, name] of file.text.matchAll(/['"`](--[\w-]*\w)['"`]\s*:/g)) declared.add(name);
  const problems: string[] = [];
  for (const match of file.text.matchAll(TOKEN_USE)) {
    const name = match[1];
    if (known.has(name) || declared.has(name) || FOREIGN.test(name)) continue;
    problems.push(`UX-003: ${file.path}:${lineOf(file.text, match.index)} uses var(${name}), which no design token defines`);
  }
  return problems;
}

export function contrastProblems(): string[] {
  return THEME_IDS.flatMap((theme) =>
    contrastResults(theme)
      .filter((result) => !result.ok)
      .map(
        ({ pair, ratio }) =>
          `UX-024: ${pair.fg} on ${pair.bg}${
            pair.over ? ` over ${pair.over}` : ''
          } is ${ratio.toFixed(2)}:1 in the ${theme} theme, needs ${pair.min}:1 (${pair.use})`,
      ),
  );
}

const isSource = (path: string): boolean =>
  /\.(?:tsx?|css|html)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.generated.css') && !path.endsWith('.d.ts');

export function readSources(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (path: string): void => {
    if (statSync(join(root, path)).isDirectory()) for (const name of readdirSync(join(root, path)).sort()) walk(posix.join(path, name));
    else if (isSource(path)) files.push({ path, text: readFileSync(join(root, path), 'utf8') });
  };
  for (const folder of SOURCE_FOLDERS) if (existsSync(join(root, folder))) walk(folder);
  return files;
}

export function tokenProblems(root = ROOT): string[] {
  const problems: string[] = [];
  const read = (path: string): string | null => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null);
  if (read(CSS_FILE) !== renderTokensCss())
    problems.push(`UX-003: ${CSS_FILE} is not what packages/zplc-ide/src/theme/tokens.ts renders; run bun tools/ci/ux-tokens.ts --write`);
  if (read(SCOPES_FILE) !== renderScopesCss())
    problems.push(
      `UX-004: ${SCOPES_FILE} is not what packages/zplc-ide/src/theme/tokens.ts renders; run bun tools/ci/ux-tokens.ts --write`,
    );
  const design = read(DESIGN_FILE);
  if (design === null) problems.push(`UX-032: ${DESIGN_FILE} is missing`);
  else {
    let expected: string | null = null;
    try {
      expected = applyGeneratedParts(design);
    } catch (error) {
      problems.push(`UX-032: ${DESIGN_FILE}: ${(error as Error).message}`);
    }
    if (expected !== null && expected !== design)
      problems.push(`UX-032: ${DESIGN_FILE} differs from the token tables the source renders; run bun tools/ci/ux-tokens.ts --write`);
  }
  for (const file of readSources(root)) problems.push(...undefinedTokens(file));
  problems.push(...contrastProblems());
  return problems;
}

if (import.meta.main) {
  if (process.argv.includes('--write')) {
    writeFileSync(join(ROOT, CSS_FILE), renderTokensCss());
    mkdirSync(dirname(join(ROOT, SCOPES_FILE)), { recursive: true });
    writeFileSync(join(ROOT, SCOPES_FILE), renderScopesCss());
    writeFileSync(join(ROOT, DESIGN_FILE), applyGeneratedParts(readFileSync(join(ROOT, DESIGN_FILE), 'utf8')));
  }
  if (process.argv.includes('--ratios')) {
    for (const theme of THEME_IDS) {
      console.log(`\n${theme}`);
      for (const { pair, ratio, ok } of contrastResults(theme))
        console.log(
          `  ${ok ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(6)}:1 (min ${pair.min}) ${pair.fg} on ${pair.bg}${
            pair.over ? ` over ${pair.over}` : ''
          }`,
        );
    }
  }
  const problems = tokenProblems();
  if (problems.length > 0) {
    console.error(problems.map((problem) => `ux-tokens: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log(`ux-tokens: ok (${TOKENS.length} tokens, ${CONTRAST_PAIRS.length} contrast pairs in ${THEME_IDS.length} themes)`);
}
