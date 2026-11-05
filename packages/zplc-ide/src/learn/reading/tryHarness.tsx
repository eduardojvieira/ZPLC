/**
 * The page of the browser test of the try-it lab (ldTry.browser.test.ts): it mounts one `ld-try` block over the real
 * WebAssembly lab, in the page the Vite server serves, and keeps every lab it opened so the test can see them end.
 */
import { createRoot, type Root } from 'react-dom/client';
import { openTryLab, type TryLab } from '../../runtime/tryLab';
import type { LdTryData } from '../readingTypes';
import { LdTry } from './LdTry';

let mounted: { root: Root; host: HTMLElement } | undefined;
/** Every lab this page opened, kept after the unmount. */
let labs: TryLab[] = [];

export function mountLab(src: string, content: string, data: LdTryData): void {
  unmountLab();
  labs = [];
  const host = document.createElement('div');
  host.id = 'lab-harness';
  document.body.prepend(host);
  const root = createRoot(host);
  const open: typeof openTryLab = (text, spec) => {
    const opened = openTryLab(text, spec);
    if (opened.ok) labs.push(opened.lab);
    return opened;
  };
  root.render(<LdTry data={data} files={{ [src]: content }} open={open} />);
  mounted = { root, host };
}

export function unmountLab(): void {
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = undefined;
}

/** Whether each lab that this page opened has been closed: a closed lab refuses to be read. */
export const labsClosed = (): Promise<boolean[]> =>
  Promise.all(
    labs.map((lab) =>
      lab.readings().then(
        () => false,
        () => true,
      ),
    ),
  );
