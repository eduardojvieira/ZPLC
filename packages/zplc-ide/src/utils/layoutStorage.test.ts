import { afterEach, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { createLayoutStorage, useWorkspaceLayout, WORKSPACE_LAYOUT_ID } from './layoutStorage';

const KEY = `react-resizable-panels:${WORKSPACE_LAYOUT_ID}`;
const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, data };
};

describe('layout storage wrapper', () => {
  it('hands a saved layout to the library and stores a new one', () => {
    const store = memory({ [KEY]: '{"editor":60,"console":40}' });
    const storage = createLayoutStorage(() => store);
    expect(storage.getItem(KEY)).toBe('{"editor":60,"console":40}');
    storage.setItem(KEY, '{"editor":50,"console":50}');
    expect(store.data.get(KEY)).toBe('{"editor":50,"console":50}');
  });

  it('reports nothing saved for anything the library could not use', () => {
    for (const bad of ['', 'not json', 'null', '[1,2]', '"text"', '{"editor":"72"}', '{"editor":null}', '{"a":{"layout":[1]}}']) {
      expect({ bad, got: createLayoutStorage(() => memory({ [KEY]: bad })).getItem(KEY) }).toEqual({ bad, got: null });
    }
    expect(createLayoutStorage(() => memory()).getItem(KEY)).toBeNull();
  });

  it('survives a storage that throws, as in a private window or with site data blocked', () => {
    const blocked = { getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    const storage = createLayoutStorage(() => blocked);
    expect(storage.getItem(KEY)).toBeNull();
    expect(() => storage.setItem(KEY, '{"editor":50}')).not.toThrow();
    const noAccessor = createLayoutStorage(() => { throw new DOMException('denied', 'SecurityError'); });
    expect(noAccessor.getItem(KEY)).toBeNull();
    expect(() => noAccessor.setItem(KEY, '{"editor":50}')).not.toThrow();
    expect(createLayoutStorage(() => undefined).getItem(KEY)).toBeNull();
  });
});

describe('workspace layout', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  const install = (value: unknown) => Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { if (value instanceof Error) throw value; return value; } });

  function Workspace() {
    const { defaultLayout, onLayoutChanged } = useWorkspaceLayout();
    return createElement(Group, { orientation: 'vertical', id: 'test-group', defaultLayout, onLayoutChanged },
      createElement(Panel, { id: 'editor', defaultSize: '72%' }, 'editor'),
      createElement(Separator, { id: 'divider' }),
      createElement(Panel, { id: 'console', defaultSize: '28%' }, 'console'));
  }
  /** A restored layout renders as flex-grow; the declared defaults render as a flex-basis percentage. */
  const growth = (html: string, id: string): number => Number(new RegExp(`id="${id}"[^>]*flex-grow:\\s*([\\d.]+)`).exec(html)?.[1] ?? 'NaN');
  const basis = (html: string, id: string): string | undefined => new RegExp(`id="${id}"[^>]*flex-basis:\\s*([\\d.]+%)`).exec(html)?.[1];

  it('restores the saved panel sizes on the next start', () => {
    install(memory({ [KEY]: '{"editor":40,"console":60}' }));
    const html = renderToStaticMarkup(createElement(Workspace));
    expect([growth(html, 'editor'), growth(html, 'console')]).toEqual([40, 60]);
  });

  it('falls back to the default sizes when nothing usable is saved', () => {
    install(memory({ [KEY]: '{broken' }));
    const html = renderToStaticMarkup(createElement(Workspace));
    expect([basis(html, 'editor'), basis(html, 'console')]).toEqual(['72%', '28%']);
  });

  it('still renders when the browser refuses access to its storage', () => {
    install(new DOMException('denied', 'SecurityError'));
    expect(basis(renderToStaticMarkup(createElement(Workspace)), 'editor')).toBe('72%');
  });

  it('renders a separator that a keyboard can reach and a screen reader can name', () => {
    install(undefined);
    const html = renderToStaticMarkup(createElement(Workspace));
    expect(html).toMatch(/<div[^>]*role="separator"/);
    expect(html).toMatch(/role="separator"[^>]*tabindex="0"/);
    expect(html).toContain('data-separator="inactive"');
    expect(html).toContain('aria-orientation="horizontal"');
  });
});
