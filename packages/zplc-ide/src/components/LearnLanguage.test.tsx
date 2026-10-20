import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LESSON_INDEX } from '../generated/lessonIndex';
import { useAppSettings } from '../store/useAppSettings';

// The Learn panel reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null, getFileContent: () => null }));
const { LearnPanel } = await import('./LearnPanel');

const setLanguage = (language: 'auto' | 'en' | 'es') => useAppSettings.getState().update({ language });

// bunfig.toml pins the system language of every test to English; each test restores the setting. The panel reads the
// desktop bridge from `window`, which a server render does not have: an empty one stands for a browser without it.
const hadWindow = 'window' in globalThis;
if (!hadWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
afterEach(() => setLanguage('auto'));
afterAll(() => { if (!hadWindow) delete (globalThis as { window?: unknown }).window; });

describe('LRN-029 Learn follows the language of the application', () => {
  it('LRN-029 draws the lesson and the panel in the language of the setting, and switches when the setting changes', () => {
    // A learner with no progress sees the first lesson of the course.
    const lesson = LESSON_INDEX.lessons.find((entry) => entry.id === 'first-blink-simulation')!;
    setLanguage('en');
    const english = renderToStaticMarkup(<LearnPanel />);
    expect(english).toContain(lesson.text.en.title);
    expect(english).toContain(lesson.text.en.objectives[0]!);
    expect(english).toContain('Learning objectives');
    expect(english).not.toContain(lesson.text.es.title);

    setLanguage('es');
    const spanish = renderToStaticMarkup(<LearnPanel />);
    expect(spanish).toContain(lesson.text.es.title);
    expect(spanish).toContain(lesson.text.es.objectives[0]!);
    expect(spanish).toContain('Objetivos de aprendizaje');
    expect(spanish).not.toContain(lesson.text.en.title);
    expect(spanish).not.toContain('Learning objectives');
  });
});
