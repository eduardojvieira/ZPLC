/**
 * The scene CI harness (S2, SCN-004, PLT-006): runs the `scenario.json` of one shipped scene `plant-scenes/<id>/` with the
 * reference program (it must pass) and with the starter (it must fail), on a real `PlantCore` through the S1 seam, and
 * returns the trace hash of the reference run for the pin in `sceneHashes.json`. Problems are CI diagnostics, not product text.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createNativeScenarioSession } from '../../cli/nativeScenarioRuntime';
import { compileSingleFileWithTask } from '../../compiler';
import { compileScenario, runScenario } from '../../test-engine';
import { validatePlantMap, type PlantMapV2 } from '../../plants/plantMap';
import type { PlantSceneFile } from '../contracts';
import { createPlantCore } from '../core/plantCore';
import { parseScene } from '../core/scene';

export interface SceneCheckResult {
  sceneId: string;
  solution: 'pass' | 'fail';
  starter: 'pass' | 'fail';
  traceHash: string;
  problems: string[];
}

/** The pinned hashes: one table per platform; `null` means "compare against `linux`" (PLT-006). */
export type SceneHashes = Record<'linux' | 'darwin' | 'win32', Record<string, string> | null>;
export const expectedHash = (hashes: Partial<SceneHashes>, platform: keyof SceneHashes, sceneId: string): string | undefined =>
  (hashes[platform] ?? hashes.linux)?.[sceneId];

const FIXED_FACTS = ['itemsEmitted', 'itemsRemoved', 'itemsDropped', 'itemsCollided'];
const FACT_GRAMMAR =
  'itemsEmitted, itemsRemoved, itemsDropped, itemsCollided, emitted:<Name>, delivered:<Name>, count:<Name>, position:<kind>:<index>, ' +
  'level:<Name>, volume:<Name>, spilledL:<Name>, highs:<Name>, inBand:<Name>';

/** Why a fact name is wrong, or undefined when it matches the fact grammar and names a part the scene has. */
function factFault(fact: string, parts: readonly string[]): string | undefined {
  const [head, ...rest] = fact.split(':');
  const grammar = `"fact:${fact}" is not a plant fact; the facts are ${FACT_GRAMMAR}`;
  if (rest.length === 0) return FIXED_FACTS.includes(head!) ? undefined : grammar;
  if (head === 'position') return rest.length === 2 && ['box', 'pallet'].includes(rest[0]!) && /^\d+$/.test(rest[1]!) ? undefined : grammar;
  if (!['emitted', 'delivered', 'count', 'level', 'volume', 'spilledL', 'highs', 'inBand'].includes(head!) || rest.length !== 1)
    return grammar;
  return parts.includes(rest[0]!)
    ? undefined
    : `"fact:${fact}" names "${rest[0]}", which is not a part of the scene; it has: ${parts.join(', ')}`;
}

/** Located problems of every `fact:` name a scenario reads (the engine reads a name it does not know as false forever). */
export function checkSceneFacts(scenario: unknown, scene: PlantSceneFile): string[] {
  const parts = scene.parts.map((part) => part.name);
  const problems: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      const problem = key.startsWith('fact:') ? factFault(key.slice('fact:'.length), parts) : undefined;
      if (problem) problems.push(`scenario.json ${path}: ${problem}`);
      walk(item, key.startsWith('fact:') ? path : `${path}.${key}`);
    }
  };
  const root = scenario as { expectations?: unknown } | null;
  walk(root?.expectations, 'expectations');
  return problems;
}

const errorDetail = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runSceneCheck(sceneDir: string, runtime: 'native' | 'wasm'): Promise<SceneCheckResult> {
  const sceneId = basename(sceneDir);
  const result: SceneCheckResult = { sceneId, solution: 'fail', starter: 'fail', traceHash: '', problems: [] };
  const fail = (problem: string): SceneCheckResult => ({ ...result, problems: [...result.problems, problem] });
  if (runtime !== 'native') return fail('runtime wasm: no scenario session exists for the WASM runtime yet; the scene check runs native');
  const read = (file: string): string => readFileSync(join(sceneDir, file), 'utf8');
  let scene: PlantSceneFile;
  let map: PlantMapV2;
  let scenario: { tickMs?: number };
  try {
    const parsed = parseScene(read('scene.json'));
    if ('problems' in parsed) return fail(`scene.json: ${parsed.problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`);
    scene = parsed.scene;
    const mapValue: unknown = JSON.parse(read('plant-map.json'));
    const mapProblems = validatePlantMap(mapValue);
    if (mapProblems.length > 0) return fail(`plant-map.json: ${mapProblems.join('; ')}`);
    if ((mapValue as { schemaVersion?: unknown }).schemaVersion !== 2) return fail('plant-map.json: a scene map must be schema 2');
    map = mapValue as PlantMapV2;
    scenario = JSON.parse(read('scenario.json'));
  } catch (error) {
    return fail(`${sceneId}: ${errorDetail(error)}`);
  }
  const factFaults = checkSceneFacts(scenario, scene);
  if (factFaults.length > 0) return { ...result, problems: factFaults };

  const runOne = async (file: 'reference.st' | 'starter.st') => {
    const source = read(file);
    const compiled = compileSingleFileWithTask(source, 'ST', {
      programName: /\bPROGRAM\s+([A-Za-z_]\w*)/i.exec(source)?.[1] ?? 'Main',
      intervalMs: scenario.tickMs,
    });
    const core = await createPlantCore(scene);
    const session = await createNativeScenarioSession(process.env);
    try {
      const run = await runScenario(
        compileScenario(scenario, compiled.debugMap, { port: { core, map }, scene }),
        compiled.zplcFile,
        session.runtime,
      );
      return { passed: run.passed, hash: await core.traceHash() };
    } finally {
      core.dispose();
      await session.close();
    }
  };
  for (const file of ['reference.st', 'starter.st'] as const) {
    try {
      const run = await runOne(file);
      if (file === 'reference.st') {
        result.solution = run.passed ? 'pass' : 'fail';
        result.traceHash = run.hash;
        if (!run.passed) result.problems.push('reference.st: the reference program does not pass scenario.json');
      } else {
        result.starter = run.passed ? 'pass' : 'fail';
        if (run.passed) result.problems.push('starter.st: the starter already passes scenario.json; it must fail');
      }
    } catch (error) {
      result.problems.push(`${file}: ${errorDetail(error)}`);
      if (file === 'reference.st') return result;
    }
  }
  return result;
}
