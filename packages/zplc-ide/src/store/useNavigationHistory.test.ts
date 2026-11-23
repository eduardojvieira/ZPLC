import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { stubProjectLoader } from '../test/dom';

await stubProjectLoader();
const { useIDEStore } = await import('./useIDEStore');
const { HISTORY_LIMIT, useNavigationHistory, watchNavigation } = await import('./useNavigationHistory');

const original = useIDEStore.getState();
const fileOf = (n: number) => ({ id: `id${n}`, path: `src/F${n}.st` });
const loaded = (count: number) => new Map(Array.from({ length: count }, (_, i) => [fileOf(i).id, fileOf(i)])) as never;
let stop = () => undefined as void;

/** Showing a file as the store does: the active file, then the target when there is a line. */
const show = (n: number, line?: number): void => {
  useIDEStore.setState({ activeFileId: fileOf(n).id });
  if (line) useIDEStore.setState({ compilerNavigationTarget: { file: fileOf(n).path, line, column: 1 } });
};
const shown = (): string | null => useIDEStore.getState().activeFileId;

beforeEach(() => {
  useNavigationHistory.getState().reset();
  useIDEStore.setState({
    loadedFiles: loaded(60),
    activeFileId: null,
    compilerNavigationTarget: null,
    // the real action opens the file and sets the target; this one does the same without a project
    navigateToCompilerDiagnostic: async (file: string, line: number, column: number) => {
      const id = [...useIDEStore.getState().loadedFiles.values()].find((entry) => entry.path === file)?.id ?? null;
      useIDEStore.setState({ activeFileId: id, compilerNavigationTarget: { file, line, column } });
      return true;
    },
  });
  stop = watchNavigation();
});
afterEach(() => {
  stop();
  useIDEStore.setState({
    loadedFiles: original.loadedFiles,
    activeFileId: original.activeFileId,
    compilerNavigationTarget: original.compilerNavigationTarget,
    navigateToCompilerDiagnostic: original.navigateToCompilerDiagnostic,
  });
  useNavigationHistory.getState().reset();
});

describe('FND-006 back and forward', () => {
  it('FND-006 back returns to the previous place across documents and forward returns', async () => {
    show(0);
    show(1);
    show(2);
    expect(useNavigationHistory.getState().places.map((place) => place.file)).toEqual(['src/F0.st', 'src/F1.st', 'src/F2.st']);
    await useNavigationHistory.getState().back();
    expect(shown()).toBe('id1');
    await useNavigationHistory.getState().back();
    expect(shown()).toBe('id0');
    await useNavigationHistory.getState().back(); // nothing before the first place
    expect(shown()).toBe('id0');
    await useNavigationHistory.getState().forward();
    expect(shown()).toBe('id1');
    // going back and forward records nothing
    expect(useNavigationHistory.getState().places).toHaveLength(3);
    expect(useNavigationHistory.getState().index).toBe(1);
  });

  it('FND-006 a place pushed after back drops the forward tail', async () => {
    show(0);
    show(1);
    show(2);
    await useNavigationHistory.getState().back();
    show(5, 12);
    expect(useNavigationHistory.getState().places.map((place) => [place.file, place.line])).toEqual([
      ['src/F0.st', undefined],
      ['src/F1.st', undefined],
      ['src/F5.st', 12],
    ]);
    await useNavigationHistory.getState().forward(); // no tail left
    expect(shown()).toBe('id5');
  });

  it('FND-006 the stack is bounded', () => {
    for (let n = 0; n < 60; n++) show(n);
    const { places, index } = useNavigationHistory.getState();
    expect(places).toHaveLength(HISTORY_LIMIT);
    expect(index).toBe(HISTORY_LIMIT - 1);
    expect(places[0]!.file).toBe('src/F10.st');
    expect(places.at(-1)!.file).toBe('src/F59.st');
  });
});
