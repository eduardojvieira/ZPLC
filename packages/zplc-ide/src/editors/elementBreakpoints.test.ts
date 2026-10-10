import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compileSingleFileWithTask, type DebugMap, type PLCLanguage } from '../compiler';
import type { ProjectFileWithHandle } from '../types';

// The store imports the bundled-example loader, which only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
const { useIDEStore } = await import('../store/useIDEStore');
const { elementBreakpointsOf, reconcileElementBreakpoints, toggleElementBreakpoint } = await import('./elementBreakpoints');

const projects = join(import.meta.dir, '../../projects');
const ldText = readFileSync(join(projects, 'blinky/src/main.ld.json'), 'utf8');
const ldModel = JSON.parse(ldText) as { rungs: Array<{ id: string; number: number; grid: unknown[][]; comment?: string }> };

const file = (path: string, language: PLCLanguage): ProjectFileWithHandle => ({
  id: `file:${path}`, name: path.split('/').pop()!, path, parentPath: 'src', language, content: '', isModified: false,
});

function build(language: PLCLanguage, content: string, sourceRef: string): DebugMap {
  return compileSingleFileWithTask(content, language, { sourceRef, programName: 'Main' }).debugMap;
}

const pcOfRung = (map: DebugMap, rung: string): number => {
  const pou = Object.values(map.pou)[0]!;
  return Math.min(...pou.sourceMap.filter((range) => range.element?.startsWith(`rung:${rung}`)).map((range) => range.pc));
};

let session = 700;
beforeEach(() => {
  session += 1;
  useIDEStore.setState((state) => ({ projectSession: session, loadedFiles: new Map(), debug: { ...state.debug, debugMap: null, breakpoints: new Map() } }));
});
afterEach(() => {
  useIDEStore.setState((state) => ({ loadedFiles: new Map(), debug: { ...state.debug, debugMap: null, breakpoints: new Map() } }));
});

describe('LNG-004 a breakpoint on an element is armed at the element and follows it from build to build', () => {
  const ld = file('src/main.ld.json', 'LD');
  const second = ldModel.rungs[1]!.id;

  it('refuses a breakpoint until a build has said where the element is', () => {
    useIDEStore.setState({ loadedFiles: new Map([[ld.id, ld]]) });
    expect(toggleElementBreakpoint(ld.id, `rung:${second}`)).toBe(false);
    expect(elementBreakpointsOf(ld.id).size).toBe(0);
    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([]);
  });

  it('arms the first instruction of the rung, and clears it with a second toggle', () => {
    const map = build('LD', ldText, ld.path);
    useIDEStore.setState({ loadedFiles: new Map([[ld.id, ld]]) });
    useIDEStore.getState().setDebugMap(map);

    expect(toggleElementBreakpoint(ld.id, `rung:${second}`)).toBe(true);
    expect([...elementBreakpointsOf(ld.id)]).toEqual([`rung:${second}`]);
    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([pcOfRung(map, second)]);

    expect(toggleElementBreakpoint(ld.id, `rung:${second}`)).toBe(true);
    expect(elementBreakpointsOf(ld.id).size).toBe(0);
    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([]);
  });

  it('keeps the breakpoint on the same rung when a rung is inserted above it and the project is built again', () => {
    const before = build('LD', ldText, ld.path);
    useIDEStore.setState({ loadedFiles: new Map([[ld.id, ld]]) });
    useIDEStore.getState().setDebugMap(before);
    toggleElementBreakpoint(ld.id, `rung:${second}`);
    const armed = useIDEStore.getState().getAllBreakpointPCs();
    expect(armed).toEqual([pcOfRung(before, second)]);

    // a copy of the first rung goes in front of everything: every generated line after it moves
    const copy = structuredClone(ldModel.rungs[0]!);
    const inserted = { ...ldModel, rungs: [{ ...copy, id: 'rung_new', number: 1 }, ...ldModel.rungs.map((rung, index) => ({ ...rung, number: index + 2 }))] };
    const after = build('LD', JSON.stringify(inserted), ld.path);
    useIDEStore.getState().setDebugMap(after);
    reconcileElementBreakpoints();

    const moved = useIDEStore.getState().getAllBreakpointPCs();
    expect(moved).toEqual([pcOfRung(after, second)]);
    expect(moved).not.toEqual(armed);
  });

  it('forgets a breakpoint whose rung is no longer in the file', () => {
    const before = build('LD', ldText, ld.path);
    useIDEStore.setState({ loadedFiles: new Map([[ld.id, ld]]) });
    useIDEStore.getState().setDebugMap(before);
    toggleElementBreakpoint(ld.id, `rung:${second}`);

    const without = { ...ldModel, rungs: ldModel.rungs.filter((rung) => rung.id !== second).map((rung, index) => ({ ...rung, number: index + 1 })) };
    useIDEStore.getState().setDebugMap(build('LD', JSON.stringify(without), ld.path));
    reconcileElementBreakpoints();

    expect(elementBreakpointsOf(ld.id).size).toBe(0);
    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([]);
  });

  it('is per project session: a new project does not inherit the breakpoints of the last one', () => {
    const map = build('LD', ldText, ld.path);
    useIDEStore.setState({ loadedFiles: new Map([[ld.id, ld]]) });
    useIDEStore.getState().setDebugMap(map);
    toggleElementBreakpoint(ld.id, `rung:${second}`);

    useIDEStore.setState({ projectSession: session + 1000 });
    expect(elementBreakpointsOf(ld.id).size).toBe(0);
  });
});

describe('LNG-004 a breakpoint on an IL line is the line of the IL source', () => {
  const il = file('src/main.il', 'IL');
  const text = 'PROGRAM Main\nVAR\n  Sw AT %IX0.0 : BOOL;\n  Lamp AT %QX0.0 : BOOL;\nEND_VAR\n  LD Sw\n  ST Lamp\nEND_PROGRAM\n';

  it('stores the IL line and binds the instruction generated for it', () => {
    const map = build('IL', text, il.path);
    useIDEStore.setState({ loadedFiles: new Map([[il.id, il]]) });
    useIDEStore.getState().setDebugMap(map);
    // the editor sets a dot on line 7 of the IL source, as it would for a Structured Text file
    useIDEStore.getState().setBreakpoints(il.id, [7]);

    const pou = Object.values(map.pou)[0]!;
    expect(useIDEStore.getState().getAllBreakpointPCs()).toEqual([pou.sourceMap.find((range) => range.line === 7)!.pc]);
    expect(pou.sourceMap.find((range) => range.line === 7)?.element).toBe('line:7');
  });
});
