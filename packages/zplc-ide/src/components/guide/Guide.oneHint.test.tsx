import { describe, expect, it, mock } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from '../../test/dom';

// CRS-017: a lesson with exactly one hint shows no hint when solutions are hidden, and the notice stays.
const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const real = await import('../learnLesson');
const catalog = {
  en: real.learnLessonCatalog.en.map((entry) => ({ ...entry, hints: entry.hints.slice(0, 1) })),
  es: real.learnLessonCatalog.es.map((entry) => ({ ...entry, hints: entry.hints.slice(0, 1) })),
};
void mock.module('../learnLesson', () => ({ ...real, learnLessonCatalog: catalog }));
const { useAppSettings } = await import('../../store/useAppSettings');
const { useLearnProgress } = await import('../../learn/progressState');
const { Guide } = await import('./Guide');

describe('The Guide with one hint (CRS-017)', () => {
  it('CRS-017 hidden: no hint and the notice; shown: the hint', () => {
    dom.patchStore(useLearnProgress, { document: null, loaded: true, failed: false } as never);
    for (const hideSolutions of [true, false]) {
      dom.patchStore(useAppSettings, {
        settings: { ...useAppSettings.getState().settings, unlockAllLessons: true, hideSolutions },
      } as never);
      const { unmount } = dom.render(<Guide />);
      const hints = dom.screen.getByRole('region', { name: dom.t('learn.hints') }).querySelectorAll('details');
      expect(hints.length).toBe(hideSolutions ? 0 : 1);
      expect(document.querySelector('[data-learn-solutions-hidden]') !== null).toBe(hideSolutions);
      unmount();
    }
  });
});
