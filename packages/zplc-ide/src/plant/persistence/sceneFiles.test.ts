// A scene is saved with its project, as <project>/scenes/<name>.scene.json (SCN-006).
import { describe, expect, it } from 'bun:test';
import type { PlantSceneFile } from '../contracts';
import { MAX_SCENE_BYTES, listScenes, openScene, readSceneTexts, sceneFilePath, saveScene, saveProjectScene } from './sceneFiles';

class FakeFile {
  constructor(public text = '') {}
  async getFile() {
    return { size: new TextEncoder().encode(this.text).length, text: async () => this.text };
  }
  async createWritable() {
    return {
      write: async (value: string) => {
        this.text = value;
      },
      close: async () => undefined,
    };
  }
}
class FakeDirectory {
  files = new Map<string, FakeFile>();
  directories = new Map<string, FakeDirectory>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let directory = this.directories.get(name);
    if (!directory && options?.create) this.directories.set(name, (directory = new FakeDirectory()));
    if (!directory) throw new Error('not found');
    return directory;
  }
  async *values() {
    for (const [name] of this.files) yield { kind: 'file' as const, name };
    for (const [name] of this.directories) yield { kind: 'directory' as const, name };
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let file = this.files.get(name);
    if (!file && options?.create) this.files.set(name, (file = new FakeFile()));
    if (!file) throw new Error('not found');
    return file;
  }
}
const asHandle = (directory: FakeDirectory) => directory as unknown as FileSystemDirectoryHandle;

const scene = (over: Partial<PlantSceneFile> = {}): PlantSceneFile => ({
  schemaVersion: 1,
  name: 'line',
  parts: [{ id: 'belt-1', part: 'belt', name: 'Belt1', position: [0, 0, 0], rotationYDeg: 0, config: { speedMps: 0.5 } }],
  cameras: [],
  ...over,
});

/** One text per released schema version; later versions extend this list. */
const FIXTURES: ReadonlyArray<{ version: number; text: string }> = [{ version: 1, text: JSON.stringify(scene()) }];

async function project(name: string, text: string) {
  const root = new FakeDirectory();
  (await (await root.getDirectoryHandle('scenes', { create: true })).getFileHandle(`${name}.scene.json`, { create: true })).text = text;
  return root;
}

describe('scene files', () => {
  it('SCN-006 a scene is saved in the project and reopened byte-identically', async () => {
    const root = new FakeDirectory();
    await saveScene(asHandle(root), 'line', scene());
    const saved = root.directories.get('scenes')!.files.get('line.scene.json')!.text;
    expect(sceneFilePath('line')).toBe('scenes/line.scene.json');
    const opened = await openScene(asHandle(root), 'line');
    if (!('scene' in opened)) throw new Error(JSON.stringify(opened));
    expect(opened.scene).toEqual(scene());
    await saveScene(asHandle(root), 'again', opened.scene);
    expect(root.directories.get('scenes')!.files.get('again.scene.json')!.text).toBe(saved);
  });

  it('SCN-006 a scene written by an older schema opens through the migration', async () => {
    for (const { version, text } of FIXTURES) {
      const opened = await openScene(asHandle(await project('old', text)), 'old');
      expect(`v${version}:${'scene' in opened}`).toBe(`v${version}:true`);
    }
  });

  it('SCN-006 a scene of a newer version fails with a message that names the version', async () => {
    const opened = await openScene(asHandle(await project('new', JSON.stringify({ ...scene(), schemaVersion: 99 }))), 'new');
    if (!('problems' in opened)) throw new Error('expected a failure');
    expect(opened.problems[0]!.path).toBe('schemaVersion');
    expect(opened.problems[0]!.message).toContain('schemaVersion 99');
  });

  it('SCN-006 a scene larger than the cap is refused on save and on open', async () => {
    const big = scene({ name: 'x'.repeat(MAX_SCENE_BYTES) });
    const root = new FakeDirectory();
    await expect(saveScene(asHandle(root), 'big', big)).rejects.toThrow('larger than');
    expect(root.directories.get('scenes')?.files.has('big.scene.json') ?? false).toBe(false);
    const opened = openScene(asHandle(await project('big', 'x'.repeat(MAX_SCENE_BYTES + 1))), 'big');
    await expect(opened).rejects.toThrow('larger than');
  });

  it('SCN-006 a scene file outside <project>/scenes is not readable through the plant API', async () => {
    const root = await project('line', JSON.stringify(scene()));
    root.files.set('zplc.json', new FakeFile(JSON.stringify(scene())));
    for (const name of ['../zplc', '..', 'a/b', 'a\\b', '', '.hidden', 'x.scene.json/../../zplc', 'a\0b'])
      await expect(openScene(asHandle(root), name)).rejects.toThrow('scene name');
    await expect(saveScene(asHandle(root), '../zplc', scene())).rejects.toThrow('scene name');
  });

  it('SCN-006 the scenes of a project are listed from its scenes folder, not from open files', async () => {
    const root = await project('b-line', JSON.stringify(scene()));
    await saveScene(asHandle(root), 'a-line', scene());
    root.directories.get('scenes')!.files.set('notes.txt', new FakeFile('x'));
    root.directories.get('scenes')!.files.set('a-line.plant-map.json', new FakeFile('{}'));
    expect(await listScenes(asHandle(root))).toEqual(['a-line', 'b-line']);
    expect(await listScenes(asHandle(new FakeDirectory()))).toEqual([]);
  });

  it('SCN-016 a scene saved with its plant map is read back with both texts, and without a map reads an empty map', async () => {
    const root = new FakeDirectory();
    await saveScene(asHandle(root), 'with-map', scene(), '{"schemaVersion":2}');
    await saveScene(asHandle(root), 'bare', scene());
    expect(root.directories.get('scenes')!.files.get('with-map.plant-map.json')!.text).toBe('{"schemaVersion":2}');
    expect(await readSceneTexts(asHandle(root), 'with-map')).toEqual({
      scene: root.directories.get('scenes')!.files.get('with-map.scene.json')!.text,
      map: '{"schemaVersion":2}',
    });
    expect((await readSceneTexts(asHandle(root), 'bare')).map).toBe('');
  });
});

describe('the scene of the project itself', () => {
  it('is written as scene.json and plant-map.json at the root, and creates no scenes folder', async () => {
    const root = new FakeDirectory();
    await saveProjectScene(asHandle(root), scene(), '{"schemaVersion":2}');
    expect(JSON.parse(root.files.get('scene.json')!.text).name).toBe('line');
    expect(root.files.get('plant-map.json')!.text).toBe('{"schemaVersion":2}');
    expect(root.directories.size).toBe(0);
  });

  it('refuses a scene larger than the cap and writes nothing', async () => {
    const root = new FakeDirectory();
    const big = scene({ name: 'x'.repeat(MAX_SCENE_BYTES) });
    await expect(saveProjectScene(asHandle(root), big)).rejects.toThrow('larger than');
    expect(root.files.size).toBe(0);
  });
});
