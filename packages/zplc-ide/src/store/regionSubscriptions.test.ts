// IDE-013: typing in a 2,000-line file while 200 watched values update ten times a second must not render the regions
// that show neither. There is no DOM test environment in this repository (and none may be added), so this measures what
// decides a render: a component re-renders when the value its selector returns is not the same as the one before
// (`Object.is`, or a shallow comparison under `useShallow`). The selectors are the ones the components use
// (src/store/regionSubscriptions.ts and src/hooks/useDebugValue.ts), run against the real store and its real actions.
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { shallow } from 'zustand/shallow';

await mock.module('../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { useIDEStore } = await import('./useIDEStore');
const { REGION_SELECTORS } = await import('./regionSubscriptions');
const { selectLiveValues } = await import('../hooks/useDebugValue');

type State = ReturnType<typeof useIDEStore.getState>;
type Selector = (state: State) => unknown;

/** How many times each selector's result changes while `work` runs: the renders of the region that uses it. */
function renders(selectors: Record<string, Selector>, work: () => void): Record<string, number> {
  const counts: Record<string, number> = {};
  const last: Record<string, unknown> = {};
  for (const [name, select] of Object.entries(selectors)) { counts[name] = 0; last[name] = select(useIDEStore.getState()); }
  const stop = useIDEStore.subscribe((state) => {
    for (const [name, select] of Object.entries(selectors)) {
      const next = select(state);
      // the components pass their selector to useShallow: a render is a change that is not shallowly equal
      if (!shallow(last[name], next)) { counts[name] = (counts[name] ?? 0) + 1; last[name] = next; }
    }
  });
  try { work(); } finally { stop(); }
  return counts;
}

const WATCHED = 200;
const TICKS = 100; // ten seconds at ten times a second
const watched = Array.from({ length: WATCHED }, (_, index) => `Plant.value${index}`);
const source = Array.from({ length: 2000 }, (_, line) => `v${line % 50} := v${(line + 1) % 50} + ${line};`).join('\n');

beforeEach(() => {
  const file = { id: 'file:main', name: 'main.st', path: 'src/main.st', parentPath: 'src', language: 'ST' as const, content: source, isModified: false };
  useIDEStore.setState((state) => ({
    loadedFiles: new Map([[file.id, file]]), activeFileId: file.id, openTabs: [file.id],
    debug: { ...state.debug, watchVariables: watched, liveValues: new Map(watched.map((path) => [path, 0])) },
  }));
});

// The store is one object for the whole test process, and these tests type into its file: what they leave is not for the
// next file to find (useIDEStore.test.ts closes a project, which an unsaved file refuses).
afterEach(() => {
  useIDEStore.setState((state) => ({
    loadedFiles: new Map(), activeFileId: null, openTabs: [],
    debug: { ...state.debug, watchVariables: [], liveValues: new Map() },
  }));
});

const readValues = (tick: number): Map<string, number> => new Map(watched.map((path, index) => [path, tick * 3 + index]));
const watchedRegions = { ...REGION_SELECTORS } as Record<string, Selector>;

describe('regions render for what they show (IDE-013)', () => {
  it('200 watched values read 100 times render no region that shows none of them', () => {
    const counts = renders(watchedRegions, () => {
      for (let tick = 1; tick <= TICKS; tick++) useIDEStore.getState().updateLiveValues(readValues(tick));
    });
    expect(counts).toEqual(Object.fromEntries(Object.keys(watchedRegions).map((name) => [name, 0])));
  });

  it('a region that shows five of the 200 renders when one of the five changes, not when another does', () => {
    const five = watched.slice(0, 5);
    const sixth = watched[5]!;
    const counts = renders({ five: selectLiveValues(five), all: selectLiveValues(watched) }, () => {
      for (let tick = 1; tick <= TICKS; tick++) {
        // only the sixth value moves on odd ticks; the five move on every tenth tick
        const readings = new Map<string, number>([[sixth, tick]]);
        if (tick % 10 === 0) for (const path of five) readings.set(path, tick);
        useIDEStore.getState().updateLiveValues(readings);
      }
    });
    expect(counts.five).toBe(10);
    expect(counts.all).toBe(TICKS);
  });

  it('a reading that is the value it was publishes nothing', () => {
    useIDEStore.getState().updateLiveValues(readValues(1));
    const before = useIDEStore.getState();
    let publications = 0;
    const stop = useIDEStore.subscribe(() => { publications += 1; });
    for (let tick = 0; tick < TICKS; tick++) useIDEStore.getState().updateLiveValues(readValues(1));
    useIDEStore.getState().updateLiveValue(watched[0]!, 1 * 3 + 0);
    stop();
    expect(publications).toBe(0);
    expect(useIDEStore.getState()).toBe(before);
  });

  it('typing in the file renders the regions that show it and none of the others', () => {
    const counts = renders(watchedRegions, () => {
      for (let key = 1; key <= 100; key++) useIDEStore.getState().updateFileContent('file:main', `${source}\n(* ${key} *)`);
    });
    // the tab bar and the editor show the file; the Console shows the problems that typing clears and its staleness fences
    expect(counts.openFiles).toBe(100);
    expect(counts.console).toBeGreaterThan(0);
    for (const name of ['editorArea', 'toolbar', 'sidebar', 'welcome', 'theme', 'projectSettings', 'fileTree', 'activeFileInfo']) {
      expect(`${name}: ${counts[name]}`).toBe(`${name}: 0`);
    }
  });

  it('typing while the values update renders the regions of the editor by its keystrokes, not by the readings', () => {
    const counts = renders(watchedRegions, () => {
      for (let tick = 1; tick <= TICKS; tick++) {
        useIDEStore.getState().updateLiveValues(readValues(tick));
        if (tick % 2 === 0) useIDEStore.getState().updateFileContent('file:main', `${source}\n(* ${tick} *)`);
      }
    });
    expect(counts.openFiles).toBe(50);
    expect(counts.console).toBe(50);
    for (const name of ['editorArea', 'toolbar', 'sidebar', 'welcome', 'theme', 'projectSettings', 'fileTree', 'activeFileInfo']) {
      expect(`${name}: ${counts[name]}`).toBe(`${name}: 0`);
    }
  });
});
