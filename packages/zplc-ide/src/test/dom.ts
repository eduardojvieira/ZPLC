/**
 * The DOM environment of the render tests (VF-007), kept apart from the rest of the suite.
 *
 * Bun runs every test file in one process, and the plain tests assume there is no `window` or `document`. A render test
 * file is named `*.dom.test.tsx` and starts with `const dom = await setupDom();`: that registers happy-dom, loads
 * Testing Library once the document exists, and unregisters happy-dom when the file is done. Nothing registers the DOM
 * globally, so the other files never see it.
 */
import { afterAll, afterEach, mock } from 'bun:test';
// React's scheduler keeps the timer functions that exist when it is first loaded. Load it now, before any DOM is
// registered, so it keeps Bun's own timers and not those of the first happy-dom window (closed after its file).
import 'react-dom/client';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { ReactElement } from 'react';
import type { RenderOptions } from '@testing-library/react';
import type { BoundFunctions, queries } from '@testing-library/dom';
import { useAppSettings } from '../store/useAppSettings';
import type { Locale } from '../i18n';
import { translatorFor } from '../i18n';

export interface DomHarness {
  /** Renders `ui` into the current document with a `userEvent` bound to it. `locale` defaults to English. */
  render: (ui: ReactElement, options?: RenderOptions & { locale?: Locale }) => ReturnType<typeof import('@testing-library/react').render> & {
    user: ReturnType<typeof import('@testing-library/user-event').default.setup>;
  };
  /** The catalog translator, so a test finds an element by the text a person sees and survives a rename. */
  t: ReturnType<typeof translatorFor>['t'];
  /** The translator of another locale, for a test that renders in it. */
  tFor: (locale: Locale) => ReturnType<typeof translatorFor>['t'];
  /** Queries on the whole document, including portals (a `screen` bound at import time would point at a past document). */
  screen: BoundFunctions<typeof queries>;
  act: typeof import('@testing-library/react').act;
  waitFor: typeof import('@testing-library/react').waitFor;
  fireEvent: typeof import('@testing-library/react').fireEvent;
  within: (element: HTMLElement) => BoundFunctions<typeof queries>;
  /** Lets the promises that a mounted component started finish inside `act`, so React does not warn about the update. */
  settle: () => Promise<void>;
  /** Sets fields of a zustand store for the test and puts the old values back after it. */
  patchStore: <S extends object>(store: { getState: () => S; setState: (partial: Partial<S>) => void }, partial: Partial<S>) => void;
}

/**
 * The store imports the loader of the bundled examples, which only exists under Vite (`import.meta.glob`). A test that
 * reaches the store calls this first and then imports the store and its components with `await import(...)`.
 */
export const stubProjectLoader = async (): Promise<void> => {
  await mock.module('../utils/projectLoader', () => ({ getAvailableProjects: () => [], loadProject: () => null, loadProjectAssets: () => null }));
};

/** Monaco cannot start without a browser engine and a worker; a panel that only links to it gets an empty editor. The code editors stay on the VF-007 remaining list. */
export const stubMonaco = async (): Promise<void> => {
  await mock.module('../components/monacoRuntime', () => ({ DiffEditor: () => null, monacoEditor: { setTheme: () => undefined, getModels: () => [], defineTheme: () => undefined } }));
};

/** True when `element` holds the focus. A boolean keeps a failing assertion short: a happy-dom element prints thousands of lines. */
export const isFocused = (element: Element): boolean => document.activeElement === element;

export async function setupDom(): Promise<DomHarness> {
  if (GlobalRegistrator.isRegistered) throw new Error('A DOM render test file left happy-dom registered');
  GlobalRegistrator.register({ url: 'http://localhost/' });
  const rtl = await import('@testing-library/react');
  const { default: userEvent } = await import('@testing-library/user-event');
  const previousLanguage = useAppSettings.getState().settings.language;

  const restores: Array<() => void> = [];
  afterEach(() => {
    rtl.cleanup();
    while (restores.length > 0) restores.pop()!();
    useAppSettings.getState().update({ language: previousLanguage });
  });
  afterAll(async () => {
    rtl.cleanup();
    // React's scheduler still holds tasks that read `window`; let them run while it exists.
    await rtl.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    await GlobalRegistrator.unregister();
  });

  return {
    render: (ui, options = {}) => {
      const { locale = 'en', ...rest } = options;
      useAppSettings.getState().update({ language: locale });
      const user = userEvent.setup({ document });
      return { ...rtl.render(ui, rest), user };
    },
    t: translatorFor('en').t,
    tFor: (locale) => translatorFor(locale).t,
    get screen() { return rtl.within(document.body); },
    act: rtl.act,
    // The default of one second is not load-proof on a busy build machine; a timer-driven wait gets five.
    waitFor: (callback, options) => rtl.waitFor(callback, { timeout: 5000, ...options }),
    fireEvent: rtl.fireEvent,
    within: rtl.within,
    settle: () => rtl.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }),
    patchStore: (store, partial) => {
      const before = Object.fromEntries(Object.keys(partial).map((key) => [key, (store.getState() as Record<string, unknown>)[key]]));
      store.setState(partial);
      restores.push(() => store.setState(before as never));
    },
  };
}
