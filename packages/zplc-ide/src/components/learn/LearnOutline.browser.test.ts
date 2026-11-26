import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { browserApp, closeBrowserApp } from '../../test/browser';
import { allOpenLessonRows, syntheticCourse } from './syntheticCourse';

// GDE-002: the plan's rule for the outline (Task G3) is "virtualised only if a render test over a 111-lesson fixture takes over
// 100 ms". Its worst case is the fully open tree the filter produces, measured here in headless Chromium (src/test/browser.ts).
setDefaultTimeout(180_000);
afterAll(closeBrowserApp);

const HARNESS = `import('/src/components/learn/outlineHarness.tsx')`;
const LESSON_ROWS = `document.querySelectorAll('#outline-harness [role="treeitem"][aria-level="2"]').length`;
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;

describe('the course outline in a browser (GDE-002)', () => {
  test('GDE-002 the fully open outline of a 111-lesson course renders within the budget', async () => {
    const app = await browserApp();
    await app.reload();
    await app.eval(`${HARNESS}.then((h) => { h.mountOutline(); return true; })`);
    await app.until('the outline', `document.querySelector('#outline-harness [role="tree"]') !== null`);
    const rows = allOpenLessonRows(syntheticCourse());
    await app.click('#outline-harness [data-learn-outline] input');
    // One warm-up, then five samples: "s" opens every path and module (every title holds it), Backspace closes them again.
    for (let sample = 0; sample < 6; sample++) {
      await app.type('s');
      await app.until('every row open', `${LESSON_ROWS} === ${rows}`);
      await app.press('Backspace');
      await app.until('the rows closed', `${LESSON_ROWS} === 0`);
    }
    // Each key leaves one sample: the odd ones are the "s" that opened every row.
    const renders = await app.eval<number[]>(`${HARNESS}.then((h) => [...h.keyRenders])`);
    const opening = renders.filter((_, index) => index % 2 === 0).slice(1);
    expect(opening).toHaveLength(5);
    console.log(`outline: every row open in ${opening.map((ms) => ms.toFixed(1)).join(', ')} ms (median ${median(opening).toFixed(1)})`);
    expect(median(opening)).toBeLessThan(100);
    await app.eval(`${HARNESS}.then((h) => { h.unmountOutline(); return true; })`);
  });
});
