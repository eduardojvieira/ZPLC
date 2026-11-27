import { describe, expect, it } from 'bun:test';
import { setupDom, stubMonaco, stubProjectLoader } from './test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { useIDEStore } = await import('./store/useIDEStore');
const { default: App } = await import('./App');

describe('App root sizing (UX-023)', () => {
  it('sizes the Welcome screen root to the parent container rather than 100vw/100vh', async () => {
    dom.patchStore(useIDEStore, { isProjectOpen: false });
    const { container } = dom.render(<App />);
    await dom.settle();

    const rootWrapper = container.firstElementChild as HTMLElement | null;
    expect(rootWrapper).toBeTruthy();
    expect(rootWrapper?.classList.contains('w-full')).toBe(true);
    expect(rootWrapper?.classList.contains('h-full')).toBe(true);
    expect(rootWrapper?.classList.contains('w-screen')).toBe(false);
    expect(rootWrapper?.classList.contains('h-screen')).toBe(false);
  });

  it('sizes the workbench loading root to the parent container rather than 100vw/100vh', async () => {
    dom.patchStore(useIDEStore, { isProjectOpen: true });
    const { container } = dom.render(<App />);

    const rootWrapper = container.firstElementChild as HTMLElement | null;
    expect(rootWrapper).toBeTruthy();
    expect(rootWrapper?.classList.contains('w-full')).toBe(true);
    expect(rootWrapper?.classList.contains('h-full')).toBe(true);
    expect(rootWrapper?.classList.contains('w-screen')).toBe(false);
    expect(rootWrapper?.classList.contains('h-screen')).toBe(false);
    await dom.settle();
  });
});
