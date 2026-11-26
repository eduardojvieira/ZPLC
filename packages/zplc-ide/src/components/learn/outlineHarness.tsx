/**
 * The page of the browser test of the course outline (LearnOutline.browser.test.ts): it mounts the outline over the generated
 * 111-lesson course and records, for each key typed in the filter, the time from its key down to the moment the DOM holds the update.
 * A key in a text field is a discrete event, which React commits before its own listener on the root returns; a listener on `window`
 * in the bubble phase runs after that one, so it sees the committed rows (it records their count to prove it). Production React has
 * no Profiler, so this works in both builds.
 */
import { createRoot, type Root } from 'react-dom/client';
import { LearnOutline } from './LearnOutline';
import { syntheticCourse } from './syntheticCourse';

let mounted: { root: Root; host: HTMLElement } | undefined;
let keyAt: number | null = null;
/** For each key typed in the filter: the time from the key down to the committed update, and the lesson rows it shows. */
export const keyRenders: Array<{ ms: number; rows: number }> = [];

const inOutline = (event: Event): boolean => (event.target as HTMLElement | null)?.closest?.('[data-learn-outline]') != null;
const onKeyDown = (event: KeyboardEvent): void => {
  if (inOutline(event)) keyAt = performance.now();
};
const onInput = (event: Event): void => {
  if (!inOutline(event) || keyAt === null) return;
  const ms = performance.now() - keyAt;
  keyAt = null;
  keyRenders.push({ ms, rows: document.querySelectorAll('#outline-harness [role="treeitem"][aria-level="2"]').length });
};

export function mountOutline(): void {
  unmountOutline();
  keyRenders.length = 0;
  const host = document.createElement('div');
  host.id = 'outline-harness';
  document.body.prepend(host);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('input', onInput);
  const root = createRoot(host);
  root.render(<LearnOutline index={syntheticCourse()} />);
  mounted = { root, host };
}

export function unmountOutline(): void {
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('input', onInput);
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = undefined;
}
