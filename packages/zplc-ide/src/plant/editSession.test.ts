import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import type { PlantSceneFile } from './contracts';
import { createPlantCore } from './core/plantCore';
import { parseScene } from './core/scene';
import { usePlantEdit } from './editSession';

const SCENES = join(import.meta.dir, '../../plant-scenes');
const sceneOf = (id: string): PlantSceneFile => {
  const parsed = parseScene(readFileSync(join(SCENES, id, 'scene.json'), 'utf8'));
  if ('problems' in parsed) throw new Error(JSON.stringify(parsed.problems));
  return parsed.scene;
};

afterEach(() => {
  usePlantEdit.getState().setRunning(false);
  usePlantEdit.getState().end();
});

describe('the plant edit session (SCN-008, PLS-005)', () => {
  it('SCN-008 begin, undo and redo are refused while the plant runs and the trace hash is unchanged', async () => {
    const scene = sceneOf('belt-to-sensor');
    // the trace of a plant core built from a scene text and run for two seconds
    const trace = async (text: string) => {
      const core = await createPlantCore(JSON.parse(text) as PlantSceneFile);
      for (let scan = 0; scan < 200; scan += 1) core.advance(10);
      const hash = await core.traceHash();
      core.dispose();
      return hash;
    };
    const original = await trace(JSON.stringify(scene));
    const edit = usePlantEdit.getState;
    // begin refused while running: no editor, no scene reference
    edit().setRunning(true);
    edit().begin({ scene, map: null }, 'belt-to-sensor');
    expect(edit().editor).toBeNull();
    expect(edit().sceneRef).toBeNull();
    // begun while stopped; a part removed and the removal undone, so a redo would remove it again; then the plant runs
    const session = (running: boolean) => {
      edit().setRunning(false);
      edit().begin({ scene, map: null }, 'belt-to-sensor');
      edit().editor!.remove(scene.parts[0]!.id);
      edit().undo();
      edit().setRunning(running);
      const version = edit().version;
      edit().redo();
      edit().undo();
      edit().redo();
      if (running) {
        edit().begin({ scene: sceneOf('counted-queue'), map: null }, 'counted-queue');
        expect(edit().version).toBe(version);
        expect(edit().sceneRef).toBe('belt-to-sensor');
      }
      edit().setRunning(false);
      return edit().end()!.scene;
    };
    // refused while running: the plant rebuilt from the session is the original plant
    expect(await trace(session(true))).toBe(original);
    // the positive control: the same redo while stopped removes the part, and the trace differs
    expect(await trace(session(false))).not.toBe(original);
  });

  it('SCN-008 end returns the texts the plant is rebuilt from and closes the session', () => {
    const scene = sceneOf('belt-to-sensor');
    const edit = usePlantEdit.getState;
    edit().begin({ scene, map: null }, 'belt-to-sensor');
    edit().editor!.remove(scene.parts[0]!.id);
    const texts = edit().end();
    expect(JSON.parse(texts!.scene).parts.length).toBe(scene.parts.length - 1);
    expect(texts!.map).toBe(''); // nothing bound and no map before: no map text
    expect(edit().editor).toBeNull();
    expect(edit().mapEditor).toBeNull();
    expect(edit().end()).toBeNull();
  });

  it('PLS-005 an edit through the session editor bumps the version every view reads', () => {
    const scene = sceneOf('belt-to-sensor');
    const edit = usePlantEdit.getState;
    edit().begin({ scene, map: null }, 'belt-to-sensor');
    const seen: (string | null)[] = [];
    const stop = usePlantEdit.subscribe((state) => seen.push(state.editor?.state().selection ?? null));
    edit().editor!.select(scene.parts[1]!.id);
    stop();
    expect(seen).toEqual([scene.parts[1]!.id]);
  });
});
