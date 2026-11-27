import { afterEach, describe, expect, it } from 'bun:test';
import { useEffect } from 'react';
import { setupDom, stubMonaco, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
await stubMonaco();
const { DEFAULT_SHELL_STATE, useShellLayout } = await import('../store/useShellLayout');
const { WorkbenchShell } = await import('./WorkbenchShell');

const StubEditor = () => <div data-testid="stub-editor" />;
const StubConsole = () => <div data-testid="stub-console" />;

afterEach(() => {
  useShellLayout.setState({ ...DEFAULT_SHELL_STATE, maximised: false, restoreTo: null });
});

describe('WorkbenchShell initial sidebar state (UX-023)', () => {
  it('keeps the secondary sidebar collapsed on mount until it is asked for', async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    const originalRO = globalThis.ResizeObserver;

    // Give the group and panels real pixel dimensions so react-resizable-panels computes pixel sizes on mount.
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.getAttribute('data-group') !== null) {
        return { x: 0, y: 0, top: 0, left: 0, bottom: 768, right: 1366, width: 1366, height: 768, toJSON: () => ({}) } as DOMRect;
      }
      if (this.getAttribute('data-panel') !== null) {
        const raw = this.style.flexGrow;
        const basis = this.style.flexBasis;
        const width =
          raw === '0'
            ? 0
            : raw !== ''
              ? raw === '1'
                ? Math.round(1366 / 3)
                : Math.round((Number.parseFloat(raw) / 100) * 1366)
              : basis.endsWith('px')
                ? Math.round(Number.parseFloat(basis))
                : 0;
        return { x: 0, y: 0, top: 0, left: 0, bottom: 768, right: width, width, height: 768, toJSON: () => ({}) } as DOMRect;
      }
      return originalRect.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return Math.round(this.getBoundingClientRect().width);
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return Math.round(this.getBoundingClientRect().height);
      },
    });
    const observed: Array<{ callback: ResizeObserverCallback; targets: Element[]; observer: ResizeObserver }> = [];
    const flushResizeObservers = () => {
      for (const entry of observed) {
        const records = entry.targets.map((target) => {
          const rect = target.getBoundingClientRect();
          return {
            target,
            contentRect: rect as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
            contentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
            devicePixelContentBoxSize: [{ inlineSize: rect.width, blockSize: rect.height }],
          };
        });
        if (records.length > 0) entry.callback(records, entry.observer);
      }
    };
    const originalWindowRO = window.ResizeObserver;
    const MockResizeObserver = class MockResizeObserver {
      private entry: { callback: ResizeObserverCallback; targets: Element[]; observer: ResizeObserver };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], observer: this as unknown as ResizeObserver };
        observed.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve(target: Element) {
        this.entry.targets = this.entry.targets.filter((item) => item !== target);
      }
      disconnect() {
        this.entry.targets = [];
      }
    };
    globalThis.ResizeObserver = MockResizeObserver;
    window.ResizeObserver = MockResizeObserver;
    // In a browser, layout and ResizeObserver can deliver the initial panel size before useCollapsible's effect runs.
    function BrowserLayoutFlush() {
      useEffect(() => {
        flushResizeObservers();
      }, []);
      return null;
    }

    const seenVisible: boolean[] = [];
    const unsubscribe = useShellLayout.subscribe((state) => {
      seenVisible.push(state.secondaryVisible);
    });

    try {
      useShellLayout.setState({ ...DEFAULT_SHELL_STATE, secondaryVisible: false, maximised: false, restoreTo: null });
      seenVisible.length = 0;

      dom.render(
        <>
          <BrowserLayoutFlush />
          <WorkbenchShell EditorArea={StubEditor} Console={StubConsole} debugController={{} as never} />
        </>,
      );
      await dom.settle();

      const secondaryPanel = document.getElementById('secondary');
      expect(secondaryPanel).toBeTruthy();
      expect(seenVisible).not.toContain(true);
      expect(useShellLayout.getState().secondaryVisible).toBe(false);
      expect(dom.screen.queryByRole('complementary', { name: dom.t('shell.secondary.label') })).toBeNull();
      expect(secondaryPanel?.style.flexGrow).toBe('0');

      // Asking for the secondary sidebar opens it.
      await dom.act(async () => useShellLayout.getState().setSecondaryVisible(true));
      expect(useShellLayout.getState().secondaryVisible).toBe(true);
      expect(dom.screen.getByRole('complementary', { name: dom.t('shell.secondary.label') })).toBeTruthy();
    } finally {
      unsubscribe();
      HTMLElement.prototype.getBoundingClientRect = originalRect;
      if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
      if (originalOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight);
      globalThis.ResizeObserver = originalRO;
      window.ResizeObserver = originalWindowRO;
    }
  });
});
