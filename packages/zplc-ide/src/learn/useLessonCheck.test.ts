import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('../store/useIDEStore');
const { useAppSettings } = await import('../store/useAppSettings');
const { answerConfirmation, currentConfirmation, mountConfirmHost } = await import('../store/actionConfirm');
const { useLessonCheck } = await import('./useLessonCheck');

type Hook = ReturnType<typeof useLessonCheck>;
const modified = { id: 'f1', path: 'src/main.st', name: 'main.st', language: 'ST', content: 'x', isModified: true, diskContent: 'y' };
const host = window as unknown as { electronAPI?: Record<string, unknown> };
const before = host.electronAPI;
let calls: string[];
let latest: Hook;

function Probe({ per }: { per: boolean }) {
  latest = useLessonCheck(() => undefined, per ? { save: 'per-preference' } : undefined);
  return null;
}

beforeEach(() => {
  calls = [];
  host.electronAPI = {
    ...before,
    workspaceTests: { cancel: async () => undefined, lessonCheck: async () => (calls.push('check'), { status: 'unavailable' }) },
  };
  dom.patchStore(useAppSettings, { settings: { ...useAppSettings.getState().settings, saveBeforeRun: 'always' } } as never);
  dom.patchStore(useIDEStore, {
    isProjectOpen: true,
    workspaceScenarioLink: { workspaceId: 'w', projectSession: useIDEStore.getState().projectSession },
    loadedFiles: new Map([['f1', { ...modified } as never]]),
    saveAllFiles: async () => {
      calls.push('save');
      useIDEStore.setState({ loadedFiles: new Map([['f1', { ...modified, isModified: false } as never]]) });
    },
  } as never);
});
afterEach(() => {
  host.electronAPI = before;
});

describe('the lesson check hook', () => {
  it('LRN-022 without the option the old gate stays: an unsaved document is refused and nothing is saved or run', async () => {
    dom.render(createElement(Probe, { per: false }));
    expect(latest.canRun).toBe(false);
    await dom.act(() => latest.run('any-lesson'));
    expect(calls).toEqual([]);
  });

  it('FLW-006 with the Guide option an unsaved document is saved per the preference and then checked, which builds what is stale', async () => {
    dom.render(createElement(Probe, { per: true }));
    expect(latest.canRun).toBe(true);
    await dom.act(() => latest.run('any-lesson'));
    expect(calls).toEqual(['save', 'check']);
  });

  it('FLW-006 with Ask and Cancel nothing is saved or run, and the refusal is named', async () => {
    dom.patchStore(useAppSettings, { settings: { ...useAppSettings.getState().settings, saveBeforeRun: 'ask' } } as never);
    const unmount = mountConfirmHost();
    dom.render(createElement(Probe, { per: true }));
    const run = latest.run('any-lesson');
    await dom.waitFor(() => expect(currentConfirmation()).not.toBeNull());
    await dom.act(async () => {
      answerConfirmation(false);
      await run;
    });
    unmount();
    expect(calls).toEqual([]);
    expect(latest.declined('any-lesson')).toBe('cancelled');
  });
});
