// Which components and surfaces have a render test in a DOM (VF-007), checked without a new dependency:
//
//   bun tools/ci/dom-render-coverage.ts      check the repository
//
// VF-007: every component of the UI kit (UX-001) and every workbench surface of the spec (section 7.4) has a render test
// that drives it through user events in a DOM: a `*.dom.test.tsx` in happy-dom, or, for the surfaces that need a browser
// engine (Monaco and React Flow), a `*.browser.test.ts` in headless Chromium (packages/zplc-ide/src/test/browser.ts).
// The rules, each one a failure:
//   - kit: every component module `src/ui/<Name>.tsx` has `src/ui/<Name>.dom.test.tsx`, unless it is on `kitInternal`
//     with the reason it has no behaviour of its own.
//   - surfaces: every row of the table "7.4 Studio surfaces" of the spec is in dom-render-surfaces.json exactly once,
//     in one of three states. `tested` names the `*.dom.test.tsx` or `*.browser.test.ts` files that exist; `remaining` says why there is none
//     yet and cannot name a test that exists (it must move to `tested`, so the list only shrinks); `out-of-scope`
//     says why a render test is not the check (a main-process module, a stylesheet, project data).
//   - isolation: Bun runs every test file in one process, so a DOM that stayed registered would reach the other tests.
//     Only a `*.dom.test.tsx` may import happy-dom or Testing Library; `src/test/dom.ts` registers it per file.
//   - evidence: while a surface remains, the VF-007 gate note in requirement-evidence.json says how many remain, and the
//     number is right; when none remains the gate is gone (the requirement is covered by the tests, not gated).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const IDE_SRC = 'packages/zplc-ide/src';
const SPEC = 'specs/011-zplc-2-0-remediation/spec.md';
const LIST = new URL('./dom-render-surfaces.json', import.meta.url);
const EVIDENCE = new URL('./requirement-evidence.json', import.meta.url);

export type SurfaceState = 'tested' | 'remaining' | 'out-of-scope';
export interface SurfaceEntry { surface: string; where: string; state: SurfaceState; tests: string[]; reason: string }
export interface DomRenderList { kitInternal: Array<{ file: string; reason: string }>; surfaces: SurfaceEntry[] }
export interface Tree { files: string[]; read: (path: string) => string; exists: (path: string) => boolean }

/** The surface names of the table "7.4 Studio surfaces": the first cell of every body row. */
export function specSurfaces(spec: string): string[] {
  const start = spec.indexOf('### 7.4 Studio surfaces');
  if (start < 0) return [];
  const end = spec.indexOf('\n### ', start + 5);
  const rows = spec.slice(start, end < 0 ? undefined : end).split('\n').filter((line) => line.startsWith('|'));
  return rows.slice(2).map((row) => row.split('|')[1]!.trim()).filter(Boolean);
}

const RENDER_TEST = /\.(dom\.test\.tsx|browser\.test\.tsx?)$/;
const isKitComponent = (file: string): boolean => /^packages\/zplc-ide\/src\/ui\/[A-Z]\w*\.tsx$/.test(file);

export function checkDomRender(list: DomRenderList, spec: string, tree: Tree, evidenceNote: string | undefined): string[] {
  const errors: string[] = [];
  const internal = new Map(list.kitInternal.map((entry) => [entry.file, entry.reason]));
  for (const file of tree.files.filter(isKitComponent)) {
    const test = file.replace(/\.tsx$/, '.dom.test.tsx');
    if (internal.has(file)) {
      if (!internal.get(file)!.trim()) errors.push(`${file} is on kitInternal without a reason`);
      if (tree.exists(test)) errors.push(`${file} has ${test}: take it off kitInternal`);
    } else if (!tree.exists(test)) errors.push(`kit component without a render test: ${file} needs ${test}`);
  }
  for (const file of internal.keys()) if (!tree.exists(file)) errors.push(`kitInternal lists ${file}, which does not exist`);

  const names = specSurfaces(spec);
  if (names.length === 0) errors.push(`${SPEC} has no table "7.4 Studio surfaces"`);
  const seen = new Set<string>();
  for (const entry of list.surfaces) {
    if (seen.has(entry.surface)) errors.push(`surface listed twice: ${entry.surface}`);
    seen.add(entry.surface);
    if (names.length > 0 && !names.includes(entry.surface)) errors.push(`not a row of the spec table: ${entry.surface}`);
    const existing = entry.tests.filter((test) => tree.exists(test));
    for (const test of entry.tests) {
      if (!RENDER_TEST.test(test)) errors.push(`${entry.surface}: ${test} is not a *.dom.test.tsx or a *.browser.test.ts`);
      else if (!tree.exists(test)) errors.push(`${entry.surface}: ${test} does not exist`);
    }
    if (entry.state === 'tested' && entry.tests.length === 0) errors.push(`${entry.surface} is tested but names no test`);
    if (entry.state === 'remaining' && existing.length > 0) errors.push(`${entry.surface} is remaining but ${existing[0]} exists: set it to tested, the list only shrinks`);
    if (entry.state !== 'tested' && !entry.reason.trim()) errors.push(`${entry.surface} is ${entry.state} without a reason`);
  }
  for (const name of names) if (!seen.has(name)) errors.push(`spec surface missing from dom-render-surfaces.json: ${name}`);

  for (const file of tree.files.filter((path) => /\.test\.tsx?$/.test(path) && !path.endsWith('.dom.test.tsx'))) {
    if (/@happy-dom\/|happy-dom['"]|@testing-library\//.test(tree.read(file))) errors.push(`${file} imports a DOM library but is not a *.dom.test.tsx: the DOM would not stay isolated`);
  }

  const remaining = list.surfaces.filter((entry) => entry.state === 'remaining').length;
  if (remaining === 0) {
    if (evidenceNote !== undefined) errors.push('no surface remains: take the VF-007 gate out of requirement-evidence.json');
  } else if (evidenceNote === undefined) errors.push('requirement-evidence.json has no VF-007 gate note');
  else if (!evidenceNote.includes(`${remaining} surfaces remain`)) errors.push(`the VF-007 gate note must say "${remaining} surfaces remain"`);
  return errors;
}

function walk(dir: string, out: string[], root: string): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out, root);
    else out.push(path.slice(root.length + 1));
  }
}

export function checkRepository(root = resolve(dirname(new URL(import.meta.url).pathname), '../..')): string[] {
  const files: string[] = [];
  walk(join(root, IDE_SRC), files, root);
  const tree: Tree = { files, read: (path) => readFileSync(join(root, path), 'utf8'), exists: (path) => existsSync(join(root, path)) };
  const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as Record<string, Array<{ kind: string; note?: string }>>;
  const note = evidence['VF-007']?.find((record) => record.kind === 'gate')?.note;
  return checkDomRender(JSON.parse(readFileSync(LIST, 'utf8')) as DomRenderList, readFileSync(join(root, SPEC), 'utf8'), tree, note);
}

if (import.meta.main) {
  const errors = checkRepository();
  for (const error of errors) console.error(`dom-render-coverage: ${error}`);
  if (errors.length > 0) process.exit(1);
  console.log('dom-render-coverage: every kit component and every listed surface has a render test or a reason');
}
