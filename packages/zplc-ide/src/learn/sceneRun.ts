import { validatePlantMap, type PlantMapV2 } from '../plants/plantMap';
import { checkSceneFacts } from '../plant/ci/sceneCheck';
import type { PlantSceneFile } from '../plant/contracts';
import { parseScene } from '../plant/core/scene';
import { readWorkspaceProjectFile, type ToolDiagnostic } from '../cli/workspace';

const SCENE_FILE_MAX_BYTES = 512 * 1024;
const problem = (code: string, path: string, message: string): ToolDiagnostic => ({ code, message, path });

/** True when a scenario file declares a `scene` block (it drives a plant scene instead of plain signals). */
export function sceneBlockOf(input: unknown): { file: string; map: string } | undefined {
  const scene = (input as { scene?: { file?: unknown; map?: unknown } } | null)?.scene;
  return scene && typeof scene.file === 'string' && typeof scene.map === 'string' ? { file: scene.file, map: scene.map } : undefined;
}

/**
 * Reads, parses and checks the scene and the plant map a scenario names, from the project root: the single place that turns
 * a missing or broken file into a located `SCENE_*` diagnostic, shared by the Learn Check and the Tool API (`testsRun`).
 */
export async function loadSceneContext(
  root: string,
  scenarioInput: { scene: { file: string; map: string } },
): Promise<{ ok: true; scene: PlantSceneFile; map: PlantMapV2; mapFile: string } | { ok: false; diagnostics: ToolDiagnostic[] }> {
  const fail = (...diagnostics: ToolDiagnostic[]) => ({ ok: false as const, diagnostics });
  const { file, map: mapFile } = scenarioInput.scene;
  const files: string[] = [];
  for (const path of [file, mapFile]) {
    const read = await readWorkspaceProjectFile(root, path, SCENE_FILE_MAX_BYTES);
    if (!read.ok) return fail(...read.diagnostics);
    files.push(Buffer.from(read.bytes).toString('utf8'));
  }
  const parsed = parseScene(files[0]!);
  if ('problems' in parsed)
    return fail(...parsed.problems.map((entry) => problem('SCENE_INVALID', file, `${entry.path}: ${entry.message}`)));
  let mapValue: unknown;
  try {
    mapValue = JSON.parse(files[1]!);
  } catch {
    return fail(problem('SCENE_MAP_INVALID', mapFile, 'The plant map is not valid JSON'));
  }
  const mapProblems = validatePlantMap(mapValue);
  if (mapProblems.length > 0 || (mapValue as { schemaVersion?: unknown }).schemaVersion !== 2)
    return fail(
      ...(mapProblems.length > 0 ? mapProblems : ['a scene map must be schema 2']).map((message) =>
        problem('SCENE_MAP_INVALID', mapFile, message),
      ),
    );
  const facts = checkSceneFacts(scenarioInput, parsed.scene);
  if (facts.length > 0) return fail(...facts.map((message) => problem('SCENE_FACT_UNKNOWN', file, message)));
  return { ok: true, scene: parsed.scene, map: mapValue as PlantMapV2, mapFile };
}

/** The diagnostic for a scene scenario whose signals do not bind to the program (the map is where the author fixes it). */
export const sceneBindingProblem = (mapFile: string, error: unknown): ToolDiagnostic =>
  problem('SCENE_BINDING_INVALID', mapFile, error instanceof Error ? error.message : String(error));
