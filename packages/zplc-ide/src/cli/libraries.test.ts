/**
 * Libraries of a project (CMP-046) and the build options of its file (CMP-008, CMP-059)
 *
 * SPDX-License-Identifier: MIT
 */

import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import { parseDebugMap } from '@zplc/compiler';
import { main } from './index';
import { compilerCheck, compilerCompile, projectInspect, projectValidate } from './toolApi';

const roots: string[] = [];
afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });

const MOTOR = 'FUNCTION_BLOCK Motor\nVAR_INPUT run : BOOL; END_VAR\nVAR_OUTPUT on : BOOL; END_VAR\n    on := run;\nEND_FUNCTION_BLOCK\n';
const MAIN = 'PROGRAM Main\nVAR m : Motor; start : BOOL; lamp AT %Q0.0 : BOOL; END_VAR\n    m(run := start);\n    lamp := m.on;\nEND_PROGRAM\n';
const PLAIN = 'PROGRAM Main\nVAR lamp AT %Q0.0 : BOOL; END_VAR\n    lamp := TRUE;\nEND_PROGRAM\n';

async function workspace(files: Record<string, string>, manifest: Record<string, unknown> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zplc-libraries-'));
  roots.push(root);
  const project = { schemaVersion: 2, name: 'Lib', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['Main.st'] }], ...manifest };
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'zplc.json'), JSON.stringify(project));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

function messages(result: { evidence: { diagnostics: Array<{ code: string; message: string; path?: string }> } }): string[] {
  return result.evidence.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.path ?? ''} ${diagnostic.message}`);
}

describe('a library folder of the project (CMP-046)', () => {
  it('compiles with the project: a function block of the library is used by a program', async () => {
    const root = await workspace({ 'src/Main.st': MAIN, 'lib/motors/motor.st': MOTOR }, { libraries: ['lib/motors'] });
    const built = await compilerCompile(root);
    expect(built.ok).toBe(true);
    expect(messages(built)).toEqual([]);
    const map = built.debugMap!;
    expect(map.pou.Motor).toBeUndefined();
    expect(Object.values(map.pou).map((pou) => pou.sourceRef)).toContain('lib/motors/motor.st');
    expect(Object.values(map.pou).find((pou) => pou.sourceRef === 'lib/motors/motor.st')!.type).toBe('FUNCTION_BLOCK');
  });

  it('is listed by the inspection with the folder it belongs to, and a task cannot run a program from it', async () => {
    const root = await workspace({ 'src/Main.st': PLAIN, 'lib/motors/motor.st': MOTOR, 'lib/motors/Main.st': 'PROGRAM Main\nEND_PROGRAM\n' }, { libraries: ['lib/motors'] });
    const inspected = await projectInspect(root);
    expect(inspected.ok && inspected.summary.sources).toEqual([
      { name: 'Main.st', language: 'ST' },
      { name: 'Main.st', language: 'ST', library: 'lib/motors' },
      { name: 'motor.st', language: 'ST', library: 'lib/motors' },
    ]);
    // the task runs src/Main.st, never the file of the same name in the library
    const built = await compilerCompile(root);
    expect(built.ok).toBe(true);
    const only = await workspace({ 'src/Other.st': 'PROGRAM Other\nEND_PROGRAM\n', 'lib/motors/Main.st': 'PROGRAM Main\nEND_PROGRAM\n' }, { libraries: ['lib/motors'] });
    expect((await projectValidate(only)).ok).toBe(false);
  });

  it('a declaration made in the library and in src is an error that names both files', async () => {
    const root = await workspace({ 'src/Main.st': `${MOTOR}${MAIN}`, 'lib/motors/motor.st': MOTOR }, { libraries: ['lib/motors'] });
    const built = await compilerCompile(root);
    expect(built.ok).toBe(false);
    const text = messages(built).join('\n');
    expect(text).toContain('lib/motors/motor.st');
    expect(text).toContain('src/Main.st');
    expect(text).toContain("'Motor'");
  });

  it('a folder that is not listed is not compiled, and the build says which file it left out', async () => {
    const root = await workspace({ 'src/Main.st': PLAIN, 'lib/motors/motor.st': MOTOR, 'lib/valves/valve.st': MOTOR.replace('Motor', 'Valve') });
    const built = await compilerCompile(root);
    expect(built.ok).toBe(true);
    const warnings = built.evidence.diagnostics.filter((diagnostic) => diagnostic.code === 'SOURCE_NOT_COMPILED');
    expect(warnings.map((warning) => warning.path)).toEqual(['lib/motors/motor.st', 'lib/valves/valve.st']);
    expect(warnings[0]!.message).toContain('libraries');
    // listing the folder is what makes it part of the build
    const listed = await workspace({ 'src/Main.st': PLAIN, 'lib/motors/motor.st': MOTOR }, { libraries: ['lib/motors'] });
    expect((await compilerCompile(listed)).evidence.diagnostics.filter((diagnostic) => diagnostic.code === 'SOURCE_NOT_COMPILED')).toEqual([]);
  });

  it.each([
    ['a folder outside the project', ['../outside'], 'libraries[0]'],
    ['an absolute path', ['/etc'], 'libraries[0]'],
    ['the source folder', ['src'], 'libraries[0]'],
    ['the folder of the scenarios', ['tests'], 'libraries[0]'],
    ['the same folder twice', ['lib/a', 'LIB/A'], 'libraries[1]'],
    ['something that is not a folder name', [7], 'libraries[0]'],
  ])('refuses %s', async (_name, libraries, path) => {
    const root = await workspace({ 'src/Main.st': PLAIN }, { libraries });
    const result = await projectValidate(root);
    expect(result.ok).toBe(false);
    expect(result.evidence.diagnostics[0]).toMatchObject({ code: 'PROJECT_INVALID', path });
  });

  it('a library folder that does not exist, or is a link, is refused with its name', async () => {
    const missing = await workspace({ 'src/Main.st': PLAIN }, { libraries: ['lib/none'] });
    expect(messages(await compilerCheck(missing)).join(' ')).toContain('lib/none');
    const outside = await mkdtemp(join(tmpdir(), 'zplc-libraries-outside-'));
    roots.push(outside);
    await writeFile(join(outside, 'x.st'), MOTOR);
    const linked = await workspace({ 'src/Main.st': PLAIN }, { libraries: ['lib'] });
    await symlink(outside, join(linked, 'lib'), 'dir');
    const result = await compilerCheck(linked);
    expect(result.ok).toBe(false);
    expect(result.evidence.diagnostics[0]).toMatchObject({ code: 'WORKSPACE_INVALID_DIRECTORY', path: 'lib' });
  });
});

describe('compiler.warnings (CMP-008)', () => {
  const UNUSED = 'PROGRAM Main\nVAR lamp AT %Q0.0 : BOOL; spare : INT; END_VAR\n    lamp := TRUE;\nEND_PROGRAM\n';

  it('is "default" when the project does not say: the build reports an unused variable', async () => {
    const built = await compilerCheck(await workspace({ 'src/Main.st': UNUSED }));
    expect(built.ok).toBe(true);
    expect(built.evidence.diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.line}`)).toEqual(['UNUSED_VARIABLE@2']);
  });

  it('selects what a build reports: none, default, all', async () => {
    const none = await compilerCheck(await workspace({ 'src/Main.st': UNUSED }, { compiler: { warnings: 'none' } }));
    expect(none.ok && none.evidence.diagnostics).toEqual([]);
    const levelled = await compilerCheck(await workspace({ 'src/Main.st': UNUSED }, { compiler: { warnings: 'default' } }));
    expect(levelled.evidence.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['UNUSED_VARIABLE']);
    const all = await compilerCheck(await workspace({ 'src/Main.st': 'PROGRAM Main\nVAR lamp AT %Q0.0 : BOOL; w : INT; END_VAR\n    lamp := TRUE;\n    w := 1;\nEND_PROGRAM\n' }, { compiler: { warnings: 'all' } }));
    expect(all.evidence.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['WRITE_ONLY_VARIABLE']);
  });

  it('a value that is not a level is a project error that says what is accepted', async () => {
    for (const warnings of ['loud', ['UNUSED_VARIABLE'], true]) {
      const result = await projectValidate(await workspace({ 'src/Main.st': UNUSED }, { compiler: { warnings } }));
      expect(result.ok).toBe(false);
      expect(result.evidence.diagnostics[0]).toMatchObject({ code: 'PROJECT_INVALID', path: 'compiler.warnings' });
      expect(result.evidence.diagnostics[0]!.message).toContain("'none', 'default' or 'all'");
    }
  });
});

describe('the options compiler.strictTypes, compiler.debug, compiler.optimization and build.generateDebugInfo (CMP-059)', () => {
  const NARROW = 'PROGRAM Main\nVAR lamp AT %Q0.0 : BOOL; i : INT; d : DINT; END_VAR\n    d := 70000;\n    i := d;\n    lamp := i > 0;\nEND_PROGRAM\n';

  it('strictTypes makes an implicit narrowing an error', async () => {
    const lenient = await compilerCheck(await workspace({ 'src/Main.st': NARROW }));
    expect(lenient.ok).toBe(true);
    expect(lenient.evidence.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['IMPLICIT_NARROWING']);
    const strict = await compilerCheck(await workspace({ 'src/Main.st': NARROW }, { compiler: { strictTypes: true } }));
    expect(strict.ok).toBe(false);
    expect(messages(strict).join(' ')).toContain('strictTypes');
  });

  it('debug off leaves the statement ranges and line mappings out of the map and keeps the variables', async () => {
    const on = await compilerCompile(await workspace({ 'src/Main.st': NARROW }, { compiler: { debug: true } }));
    const off = await compilerCompile(await workspace({ 'src/Main.st': NARROW }, { compiler: { debug: false } }));
    const withLines = Object.values(on.debugMap!.pou).flatMap((pou) => pou.sourceMap);
    const withoutLines = Object.values(off.debugMap!.pou).flatMap((pou) => pou.sourceMap.concat(pou.breakpoints as never[]));
    expect(withLines.length).toBeGreaterThan(0);
    expect(withoutLines).toEqual([]);
    expect(Object.keys(off.debugMap!.pou.Main!.vars)).toEqual(Object.keys(on.debugMap!.pou.Main!.vars));
    // the code is the same: the option only decides what is written about it
    expect(Buffer.from(off.zplcFile!).equals(Buffer.from(on.zplcFile!))).toBe(true);
  });

  it('optimization has no effect on the code, and says so for the levels that suggest one', async () => {
    const base = await compilerCompile(await workspace({ 'src/Main.st': PLAIN }));
    for (const level of ['none', 'size', 'speed']) {
      const built = await compilerCompile(await workspace({ 'src/Main.st': PLAIN }, { compiler: { optimization: level } }));
      expect(built.ok).toBe(true);
      expect(Buffer.from(built.zplcFile!).equals(Buffer.from(base.zplcFile!))).toBe(true);
      const ignored = built.evidence.diagnostics.filter((diagnostic) => diagnostic.code === 'OPTION_IGNORED');
      expect(ignored.map((diagnostic) => diagnostic.path)).toEqual(level === 'none' ? [] : ['zplc.json']);
    }
    const refused = await projectValidate(await workspace({ 'src/Main.st': PLAIN }, { compiler: { optimization: 'ludicrous' } }));
    expect(refused.ok).toBe(false);
  });

  it('generateDebugInfo makes the CLI write the debug map beside the artifact', async () => {
    const on = await workspace({ 'src/Main.st': PLAIN }, { build: { generateDebugInfo: true } });
    const output = join(on, 'out.zplc');
    const logs: string[] = [];
    expect(await main(['compile', on, '--output', output], { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) })).toBe(0);
    const map = parseDebugMap(await readFile(`${output}.map.json`, 'utf8'));
    expect(map.programName).toBeTruthy();
    expect(Object.keys(map.pou)).toContain('Main');

    const off = await workspace({ 'src/Main.st': PLAIN });
    const quiet = join(off, 'out.zplc');
    expect(await main(['compile', off, '--output', quiet], { log: () => undefined, error: () => undefined })).toBe(0);
    await expect(stat(`${quiet}.map.json`)).rejects.toThrow();
  });
});
