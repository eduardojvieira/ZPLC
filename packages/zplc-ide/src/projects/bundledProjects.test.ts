import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile, testsRun } from '../cli/toolApi';
import { readWorkspace } from '../cli/workspace';
import { resolveProgramSource } from '../utils/programSourceResolution';

// Every example the Studio ships under projects/ has to validate against the shipped manifest schema, build with the
// real compiler, pass its own scenarios on the native runtime and carry no source file that no task builds. The
// *_starter projects are the Learn exercises (they are RED by design) and have their own tests.
const projectsRoot = fileURLToPath(new URL('../../projects', import.meta.url));
const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../zplc.schema.json', import.meta.url)), 'utf8')) as Schema;
const projectNames = readdirSync(projectsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.endsWith('_starter'))
  .map((entry) => entry.name)
  .sort();
const rootOf = (name: string): string => join(projectsRoot, name);

// Source files that are still not built by any task. The list may only shrink: the test fails when an entry is no
// longer true, so the entry has to be deleted together with the fix.
const KNOWN_ORPHANS: Record<string, string[]> = {
  pico_blinky_ton: ['src/main.st', 'src/main_ton.st'], // LX-5b splits or enables these
};

// ---- a JSON Schema (draft-07) subset checker -------------------------------------------------------------------
// The repository carries no JSON Schema library and this test must not add one, so this checks the keywords that
// zplc.schema.json uses and throws on any other keyword instead of silently accepting it.
type Schema = { [keyword: string]: unknown };
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'definitions']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const typeMatches = (type: string, value: unknown): boolean => {
  switch (type) {
    case 'object': return isRecord(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number';
    default: throw new Error(`unsupported JSON Schema type '${type}'`);
  }
};

function violations(node: Schema, value: unknown, at = '$'): string[] {
  if (typeof node.$ref === 'string') {
    const target = node.$ref.replace(/^#\//, '').split('/').reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), schema);
    if (!isRecord(target)) throw new Error(`unresolved $ref ${node.$ref} at ${at}`);
    return violations(target, value, at);
  }
  const found: string[] = [];
  for (const [keyword, rule] of Object.entries(node)) {
    if (ANNOTATIONS.has(keyword)) continue;
    switch (keyword) {
      case 'type': if (!typeMatches(rule as string, value)) found.push(`${at}: expected ${String(rule)}`); break;
      case 'enum': if (!(rule as unknown[]).includes(value)) found.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(rule)}`); break;
      case 'pattern': if (typeof value === 'string' && !new RegExp(rule as string).test(value)) found.push(`${at}: does not match ${String(rule)}`); break;
      case 'minLength': if (typeof value === 'string' && value.length < (rule as number)) found.push(`${at}: shorter than ${String(rule)}`); break;
      case 'maxLength': if (typeof value === 'string' && value.length > (rule as number)) found.push(`${at}: longer than ${String(rule)}`); break;
      case 'minimum': if (typeof value === 'number' && value < (rule as number)) found.push(`${at}: below ${String(rule)}`); break;
      case 'maximum': if (typeof value === 'number' && value > (rule as number)) found.push(`${at}: above ${String(rule)}`); break;
      case 'minItems': if (Array.isArray(value) && value.length < (rule as number)) found.push(`${at}: fewer than ${String(rule)} items`); break;
      case 'maxItems': if (Array.isArray(value) && value.length > (rule as number)) found.push(`${at}: more than ${String(rule)} items`); break;
      case 'items':
        if (!isRecord(rule)) throw new Error(`unsupported tuple 'items' at ${at}`);
        if (Array.isArray(value)) value.forEach((item, index) => found.push(...violations(rule, item, `${at}[${index}]`)));
        break;
      case 'required':
        if (isRecord(value)) for (const key of rule as string[]) if (!(key in value)) found.push(`${at}: missing required '${key}'`);
        break;
      case 'properties':
        if (isRecord(value)) for (const [key, child] of Object.entries(rule as Record<string, Schema>)) if (key in value) found.push(...violations(child, value[key], `${at}.${key}`));
        break;
      case 'additionalProperties':
        if (rule !== false) throw new Error(`unsupported additionalProperties at ${at}`);
        if (isRecord(value)) for (const key of Object.keys(value)) if (!(key in ((node.properties as Record<string, unknown> | undefined) ?? {}))) found.push(`${at}: unexpected '${key}'`);
        break;
      case 'anyOf':
        if (!(rule as Schema[]).some((alternative) => violations(alternative, value, at).length === 0)) found.push(`${at}: matches none of anyOf`);
        break;
      default: throw new Error(`unsupported JSON Schema keyword '${keyword}' at ${at}`);
    }
  }
  return found;
}

describe('the schema checker used by this file', () => {
  it('rejects values the shipped schema rejects, so a green run means something', () => {
    const base = { name: 'x', version: '1.0.0', tasks: [{ name: 'T', programs: ['main.st'] }] };
    expect(violations(schema, base)).toEqual([]);
    expect(violations(schema, { ...base, target: { board: 'no_such_board' } })).not.toEqual([]);
    expect(violations(schema, { ...base, version: 'one' })).not.toEqual([]);
    expect(violations(schema, { name: 'x', version: '1.0.0' })).not.toEqual([]);
    expect(violations(schema, { ...base, tasks: [{ name: 'T' }] })).not.toEqual([]);
  });
});

const withNativeRuntime = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.ZPLC_NATIVE_SIM_BIN;
  process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
  try { return await run(); }
  finally {
    if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
    else process.env.ZPLC_NATIVE_SIM_BIN = previous;
  }
};

describe('bundled example projects', () => {
  it('finds the bundled projects', () => {
    expect(projectNames.length).toBeGreaterThanOrEqual(15);
  });

  for (const name of projectNames) {
    describe(name, () => {
      it('has a manifest that validates against zplc.schema.json', () => {
        const manifest = JSON.parse(readFileSync(join(rootOf(name), 'zplc.json'), 'utf8')) as unknown;
        expect(violations(schema, manifest)).toEqual([]);
      });

      it('builds with the real compiler', async () => {
        const result = await compilerCompile(rootOf(name));
        expect(result.evidence.diagnostics).toEqual([]);
        expect(result.ok).toBe(true);
      });

      it('ships no generated assembly or hex under src/', () => {
        const generated = readdirSync(join(rootOf(name), 'src')).filter((file) => /\.(asm|hex)$/i.test(file));
        expect(generated).toEqual([]);
      });

      it('builds every source file under src/ (no orphan sources)', async () => {
        const loaded = await readWorkspace(rootOf(name));
        if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
        const { project, sources } = loaded.workspace;
        const built = new Set(project.tasks.flatMap((task) => task.programs).flatMap((program) => resolveProgramSource(program, sources)?.sourceRef ?? []));
        expect(sources.map((source) => source.path).filter((path) => !built.has(path))).toEqual(KNOWN_ORPHANS[name] ?? []);
      });

      const hasScenarios = existsSync(join(rootOf(name), 'tests')) && readdirSync(join(rootOf(name), 'tests')).some((file) => file.endsWith('.scenario.json'));
      if (hasScenarios) {
        itNative('passes every scenario under tests/ on the native runtime', async () => {
          const result = await withNativeRuntime(() => testsRun(rootOf(name)));
          expect(result.evidence.diagnostics).toEqual([]);
          expect(result.ok).toBe(true);
        }, 30_000);
      }
    });
  }
});

// The same 50% blinker in each IEC 61131-3 language, one project per language, so that every variant is built and tested
// (a build only compiles the files its tasks name). The default example, blinky, is the Ladder one.
const BLINKY_TOUR = [
  { project: 'blinky', language: 'LD', source: 'src/main.ld.json' },
  { project: 'blinky_st', language: 'ST', source: 'src/main.st' },
  { project: 'blinky_il', language: 'IL', source: 'src/main.il' },
  { project: 'blinky_fbd', language: 'FBD', source: 'src/main.fbd.json' },
  { project: 'blinky_sfc', language: 'SFC', source: 'src/main.sfc.json' },
] as const;

describe('Blinky language tour', () => {
  for (const { project, language, source } of BLINKY_TOUR) {
    it(`${project} builds its ${language} source and its scenario asserts both half periods`, async () => {
      const loaded = await readWorkspace(rootOf(project));
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const { sources, project: manifest } = loaded.workspace;
      const built = manifest.tasks.flatMap((task) => task.programs).flatMap((program) => resolveProgramSource(program, sources) ?? []);
      expect(built.map((program) => program.sourceRef)).toEqual([source]);
      expect(built[0]!.language).toBe(language);

      // A blink and a one-scan blip are told apart by long FOR windows: the LED must be seen ON, and OFF, for 400 ms or more.
      const scenarioFile = readdirSync(join(rootOf(project), 'tests')).find((file) => file.endsWith('.scenario.json'));
      const scenario = JSON.parse(readFileSync(join(rootOf(project), 'tests', scenarioFile!), 'utf8')) as { expectations: Array<{ kind: string; forMs?: number; condition: Record<string, boolean> }> };
      const held = scenario.expectations.filter((expectation) => expectation.kind === 'FOR' && expectation.forMs! >= 400).map((expectation) => expectation.condition['Blinky.LED_Output']);
      expect(held).toContain(true);
      expect(held).toContain(false);
    });
  }
});

// The Opta LED chaser, in Structured Text and in Ladder. The Opta has four status LEDs, D0-D3, which the Zephyr HAL
// exposes as %Q0.0-%Q0.3 (ZPLC_GPIO_OUTPUT_COUNT 4), so a program that drives any other output drives nothing.
const OPTA_CHASER = [
  { project: 'opta_led_chaser', source: 'src/led_chaser.st', program: 'OptaLEDChaser' },
  { project: 'opta_led_chaser_ld', source: 'src/led_chaser.ld.json', program: 'Opta_LED_Chaser' },
] as const;

describe('Opta LED chaser', () => {
  for (const { project, source, program } of OPTA_CHASER) {
    it(`${project} builds ${source}, drives only %Q0.0-%Q0.3 and its scenario lights each LED alone`, async () => {
      const loaded = await readWorkspace(rootOf(project));
      if (!loaded.ok) throw new Error(JSON.stringify(loaded.diagnostics));
      const { sources, project: manifest } = loaded.workspace;
      const built = manifest.tasks.flatMap((task) => task.programs).flatMap((name) => resolveProgramSource(name, sources)?.sourceRef ?? []);
      expect(built).toEqual([source]);

      const outputs = new Set([...readFileSync(join(rootOf(project), source), 'utf8').matchAll(/%Q0\.(\d+)/g)].map((match) => Number(match[1])));
      expect([...outputs].sort()).toEqual([0, 1, 2, 3]);

      const scenarioFile = readdirSync(join(rootOf(project), 'tests')).find((file) => file.endsWith('.scenario.json'));
      const scenario = JSON.parse(readFileSync(join(rootOf(project), 'tests', scenarioFile!), 'utf8')) as { expectations: Array<{ kind: string; condition: Record<string, boolean> }> };
      const litAlone = new Set(scenario.expectations.filter((expectation) => expectation.kind === 'AT').flatMap((expectation) => {
        const lit = [0, 1, 2, 3].filter((led) => expectation.condition[`${program}.LED_D${led}`] === true);
        return lit.length === 1 && [0, 1, 2, 3].every((led) => `${program}.LED_D${led}` in expectation.condition) ? lit : [];
      }));
      expect([...litAlone].sort()).toEqual([0, 1, 2, 3]);
    });
  }
});
