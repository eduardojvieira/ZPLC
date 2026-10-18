import { describe, expect, it } from 'bun:test';
import { MINIMAP_STORAGE_KEY, loadMinimap, saveMinimap } from './editorViewSettings';

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [[MINIMAP_STORAGE_KEY, initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
};

describe('minimap preference (UX-034)', () => {
  it('UX-034 is off until the user turns it on', () => {
    expect(loadMinimap(undefined)).toBe(false);
    expect(loadMinimap(memory())).toBe(false);
    expect(loadMinimap(memory('off'))).toBe(false);
    expect(loadMinimap(memory('garbage'))).toBe(false);
  });

  it('UX-034 keeps the choice of the user', () => {
    const storage = memory();
    saveMinimap(storage, true);
    expect(loadMinimap(storage)).toBe(true);
    saveMinimap(storage, false);
    expect(loadMinimap(storage)).toBe(false);
  });

  it('UX-034 reads as off and does not fail when the storage throws', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadMinimap(broken)).toBe(false);
    expect(() => saveMinimap(broken, true)).not.toThrow();
  });
});
