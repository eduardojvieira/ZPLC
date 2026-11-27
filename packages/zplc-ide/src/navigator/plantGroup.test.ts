import { afterEach, describe, expect, it } from 'bun:test';
import { SCENE_INDEX } from '../generated/sceneIndex';
import { setupDom, stubProjectLoader } from '../test/dom';

await setupDom();
await stubProjectLoader();
const { bindCommands, resetCommandsForTest } = await import('../commands/bus');
const { usePlantChoice } = await import('../plant/ui/usePlantChoice');
const { useIDEStore } = await import('../store/useIDEStore');
const { addPlant, openPlant, plantItems, plantTemplates } = await import('./plantGroup');

/** A directory handle that keeps what is written to it, for the saved files to be read back. */
function memoryDirectory(files: Map<string, string>, prefix = ''): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: async (name: string) => memoryDirectory(files, `${prefix}${name}/`),
    getFileHandle: async (name: string) => ({
      createWritable: async () => ({
        write: async (text: string) => void files.set(`${prefix}${name}`, text),
        close: async () => undefined,
      }),
    }),
  } as unknown as FileSystemDirectoryHandle;
}

const shippedId = SCENE_INDEX[0]!.id;

describe('the Plant group of the navigator (PLS-011)', () => {
  it('PLS-011 a project with no plant offers Add a plant with the empty floor and every shipped scene', () => {
    expect(plantItems(false, [])).toEqual([]);
    const templates = plantTemplates('Empty floor', 'en');
    expect(templates.map((template) => template.value)).toEqual(['empty', ...SCENE_INDEX.map((scene) => scene.id)]);
    expect(templates[0]!.label).toBe('Empty floor');
    expect(plantTemplates('Suelo vacío', 'es')[1]!.label).toBe(SCENE_INDEX[0]!.names.es);
  });

  it('PLS-011 Add a plant saves the template under a name and opens it', async () => {
    const files = new Map<string, string>();
    const opened: unknown[] = [];
    await addPlant(memoryDirectory(files), shippedId, 'my-plant', {
      shippedScene: async () => ({ scene: JSON.stringify({ schemaVersion: 1, name: 'T', parts: [], cameras: [] }), map: '' }),
      open: (ref) => void opened.push(ref),
    });
    expect([...files.keys()]).toEqual(['scenes/my-plant.scene.json']);
    expect(JSON.parse(files.get('scenes/my-plant.scene.json')!).name).toBe('T');
    expect(opened).toEqual([{ kind: 'file', name: 'my-plant' }]);
    // the empty floor is a template as well, and a new scene is never invalid
    await addPlant(memoryDirectory(files), 'empty', 'floor', {
      shippedScene: async () => undefined,
      open: () => undefined,
    });
    expect(JSON.parse(files.get('scenes/floor.scene.json')!).parts).toEqual([]);
  });
});

describe('opening a plant waits for the panel only so long (PLS-011)', () => {
  const shownScene = { panel: 'p', key: 'k', scene: { schemaVersion: 1, name: 'S', parts: [], cameras: [] }, map: undefined } as never;
  const asks: unknown[] = [];
  const reset = () => {
    asks.length = 0;
    resetCommandsForTest();
    bindCommands({ 'view.plant': () => undefined });
    usePlantChoice.setState({ shown: undefined, request: undefined, ask: (ref) => void asks.push(ref) });
  };
  afterEach(() => usePlantChoice.getState().show(undefined));
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('PLS-011 a panel that shows after the request is asked once', () => {
    reset();
    openPlant({ kind: 'file', name: 'a' }, 1000);
    usePlantChoice.setState({ shown: shownScene });
    usePlantChoice.setState({ shown: { ...(shownScene as object), key: 'k2' } as never });
    expect(asks).toEqual([{ kind: 'file', name: 'a' }]);
  });

  it('PLS-011 a project switch before the panel shows means no ask later', () => {
    reset();
    openPlant({ kind: 'file', name: 'a' }, 1000);
    useIDEStore.setState({ directoryHandle: {} as never });
    usePlantChoice.setState({ shown: shownScene });
    expect(asks).toEqual([]);
    useIDEStore.setState({ directoryHandle: null as never });
  });

  it('PLS-011 the timeout means no ask later', async () => {
    reset();
    openPlant({ kind: 'file', name: 'a' }, 5);
    await sleep(30);
    usePlantChoice.setState({ shown: shownScene });
    expect(asks).toEqual([]);
  });
});
