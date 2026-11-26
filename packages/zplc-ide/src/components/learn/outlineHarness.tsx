/**
 * The page of the browser test of the course outline (LearnOutline.browser.test.ts): it mounts the outline over the generated
 * 111-lesson course in the page the Vite server serves, and records how long each update takes from the key that caused it to the
 * end of React's commit (a Profiler), so the test measures the render and not the dispatch of the input.
 */
import { Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LearnOutline } from './LearnOutline';
import { syntheticCourse } from './syntheticCourse';

let mounted: { root: Root; host: HTMLElement } | undefined;
let keyAt: number | null = null;
/** For each key typed in the filter, the time from the key down to the commit it caused, in milliseconds. */
export const keyRenders: number[] = [];

const onKey = (event: KeyboardEvent): void => {
  if ((event.target as HTMLElement | null)?.closest('[data-learn-outline]')) keyAt = performance.now();
};

export function mountOutline(): void {
  unmountOutline();
  keyRenders.length = 0;
  const host = document.createElement('div');
  host.id = 'outline-harness';
  document.body.prepend(host);
  document.addEventListener('keydown', onKey, true);
  const root = createRoot(host);
  root.render(
    <Profiler
      id="outline"
      onRender={(_id, phase) => {
        if (phase === 'mount' || keyAt === null) return;
        keyRenders.push(performance.now() - keyAt);
        keyAt = null;
      }}
    >
      <LearnOutline index={syntheticCourse()} />
    </Profiler>,
  );
  mounted = { root, host };
}

export function unmountOutline(): void {
  document.removeEventListener('keydown', onKey, true);
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = undefined;
}
