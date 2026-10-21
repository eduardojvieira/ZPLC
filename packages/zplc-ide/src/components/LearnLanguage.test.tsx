import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LESSON_INDEX } from '../generated/lessonIndex';
import { useAppSettings } from '../store/useAppSettings';

// The Learn home reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
// The mock offers the same three exports as the other tests that mock the loader: in one test process the first mock of a
// module fixes its exports, so a mock with more names would not load after theirs (the Learn panel needs a fourth one).
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
}));
const { LearnHome } = await import('./LearnHome');

const setLanguage = (language: 'auto' | 'en' | 'es') => useAppSettings.getState().update({ language });

// bunfig.toml pins the system language of every test to English; each test restores the setting. The home reads
// `window` for folder access, which a server render does not have: an empty one stands for a browser without it.
const hadWindow = 'window' in globalThis;
if (!hadWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
afterEach(() => setLanguage('auto'));
afterAll(() => {
  if (!hadWindow) delete (globalThis as { window?: unknown }).window;
});

describe('LRN-029 Learn follows the language of the application', () => {
  it('LRN-029 draws the lessons and the Learn home in the language of the setting, and switches when the setting changes', () => {
    setLanguage('en');
    const english = renderToStaticMarkup(<LearnHome />);
    setLanguage('es');
    const spanish = renderToStaticMarkup(<LearnHome />);
    let compared = 0;
    for (const lesson of LESSON_INDEX.lessons) {
      // A title is the same in both languages only when it is a name, such as "MQTT: ...": compare the others.
      if (lesson.text.en.title === lesson.text.es.title) continue;
      compared += 1;
      expect({ id: lesson.id, english: english.includes(lesson.text.en.title), spanish: english.includes(lesson.text.es.title) }).toEqual({
        id: lesson.id,
        english: true,
        spanish: false,
      });
      expect({ id: lesson.id, english: spanish.includes(lesson.text.en.title), spanish: spanish.includes(lesson.text.es.title) }).toEqual({
        id: lesson.id,
        english: false,
        spanish: true,
      });
    }
    expect(compared).toBeGreaterThan(20);
    expect(english).toContain('>Learn<');
    expect(spanish).toContain('>Aprender<');
  });

  it('LRN-029 names the tracks of a lesson "Rutas" in Spanish, because "Pistas" are its hints', () => {
    setLanguage('es');
    const spanish = renderToStaticMarkup(<LearnHome />);
    expect(spanish).toContain('Rutas: ');
    expect(spanish).not.toContain('Pistas');
  });
});
