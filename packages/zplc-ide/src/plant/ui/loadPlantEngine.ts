/**
 * The one place the plant engine (three.js and Jolt) is reached: dynamic imports only, so no start chunk holds it (VIS-012).
 * The panel asks for the engine when a scene opens; a test gives the panel a fake one instead.
 */
import type { PlantCore, PlantSceneFile } from '../contracts';
import type { PlantRenderer, RendererOptions } from '../view/renderer';

export interface PlantEngine {
  createPlantCore(scene: PlantSceneFile): Promise<PlantCore>;
  loadRenderer(
    canvas: HTMLCanvasElement,
    scene: PlantSceneFile,
    options: RendererOptions,
  ): Promise<PlantRenderer | { unavailable: string }>;
  /** The text of a shipped scene and of its plant map (`plant-scenes/<id>/`), or undefined for an id that is not shipped. */
  shippedScene(id: string): Promise<{ scene: string; map: string } | undefined>;
}

// A function, not a constant: Bun has no `import.meta.glob`, so a test that never opens a shipped scene never evaluates it.
const shippedFiles = () => import.meta.glob<string>('../../../plant-scenes/*/{scene,plant-map}.json', { query: '?raw', import: 'default' });

export async function loadPlantEngine(): Promise<PlantEngine> {
  // `plantCore` reaches Jolt and `loadRenderer` reaches three: both stay behind these dynamic imports.
  const [core, view] = await Promise.all([import('../core/plantCore'), import('../view/renderer')]);
  return {
    createPlantCore: (scene) => core.createPlantCore(scene),
    loadRenderer: (canvas, scene, options) => view.loadRenderer(canvas, scene, options),
    async shippedScene(id) {
      const files = shippedFiles();
      const find = (name: string) => Object.entries(files).find(([path]) => path.endsWith(`/plant-scenes/${id}/${name}.json`))?.[1];
      const [scene, map] = [find('scene'), find('plant-map')];
      return scene && map ? { scene: await scene(), map: await map() } : undefined;
    },
  };
}
