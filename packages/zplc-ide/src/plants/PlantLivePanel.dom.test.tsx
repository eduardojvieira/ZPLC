import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { PlantLivePanel } = await import('./PlantLivePanel');
const { compileMultiTaskProject } = await import('../compiler');
const { LESSON_INDEX } = await import('../generated/lessonIndex');
const { getLanguageFromFilename } = await import('../types');

/** The debug map of the starter of the first lesson that ships a motor plant mapping. */
const motorDebugMap = () => {
  const lesson = LESSON_INDEX.lessons.find(({ plant }) => plant === 'motor-v1')!;
  const folder = join(import.meta.dir, '../../projects', lesson.starter.project);
  const project = JSON.parse(readFileSync(join(folder, 'zplc.json'), 'utf8'));
  const program = project.tasks[0].programs[0] as string;
  const content = readFileSync(join(folder, lesson.starter.program), 'utf8');
  return compileMultiTaskProject(project, [
    { name: program, content, language: getLanguageFromFilename(lesson.starter.program), sourceRef: lesson.starter.program },
  ]).debugMap;
};

/** A simulated runtime whose scan counter the test moves. */
const runtime = (initial: 'running' | 'paused') => {
  const state = { cycles: 0 };
  const vmState = initial;
  const adapter = {
    connected: true,
    type: 'wasm',
    getInfo: async () => ({ cycles: state.cycles }),
    peek: async (_address: number, length: number) => new Uint8Array(length),
    setValue: async () => undefined,
  };
  return { state, controller: { adapter, vmState, debugCapabilities: null } as never };
};

const scansText = () => document.querySelector('[data-plant-scans]')?.textContent ?? '';
const scans = () => Number(/(\d+)/.exec(scansText())?.[1] ?? 'NaN');

describe('Live plant panel (PLS-003, LRN-018) in a DOM', () => {
  it('PLS-003 the live plant has no play, pause or step control', async () => {
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, debugMap: motorDebugMap() as never } });
    const { controller } = runtime('running');
    dom.render(<PlantLivePanel controller={controller} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant="motor-v1"]')).toBeTruthy());
    expect(document.querySelector('[data-plant-control="play-pause"]')).toBeNull();
    expect(document.querySelector('[data-plant-control="step"]')).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('plant.play') })).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('plant.pause') })).toBeNull();
    expect(dom.screen.queryByRole('button', { name: dom.t('plant.step') })).toBeNull();
  });

  it('it keeps Reset plant and its fault actions', async () => {
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, debugMap: motorDebugMap() as never } });
    const { controller } = runtime('running');
    dom.render(<PlantLivePanel controller={controller} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant="motor-v1"]')).toBeTruthy());
    expect(dom.screen.getByRole('button', { name: dom.t('plant.reset') })).toBeTruthy();
    expect(document.querySelector('[data-plant-action="stall"]')).toBeTruthy();
  });

  it('LRN-018 pausing the program freezes the plant', async () => {
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, debugMap: motorDebugMap() as never } });
    const { controller, state } = runtime('running');
    dom.render(<PlantLivePanel controller={controller} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant="motor-v1"]')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 250)); // the first poll takes the scan counter as its start
    state.cycles += 7;
    await dom.waitFor(() => expect(scans()).toBe(7));
    expect(scansText()).toContain(dom.t('plant.running'));
    await new Promise((resolve) => setTimeout(resolve, 400)); // the program is paused: its scan counter does not move
    expect(scans()).toBe(7);
  });

  it('PLS-003 a program paused by the command bar leaves the plant on screen, holding, and a step of the program moves it', async () => {
    dom.patchStore(useIDEStore, { debug: { ...useIDEStore.getState().debug, debugMap: motorDebugMap() as never } });
    const { controller, state } = runtime('paused');
    dom.render(<PlantLivePanel controller={controller} />);
    await dom.waitFor(() => expect(document.querySelector('[data-plant="motor-v1"]')).toBeTruthy());
    expect(scansText()).toContain(dom.t('plant.paused'));
    await new Promise((resolve) => setTimeout(resolve, 250));
    state.cycles += 1; // one step of the program
    await dom.waitFor(() => expect(scans()).toBe(1));
  });
});
