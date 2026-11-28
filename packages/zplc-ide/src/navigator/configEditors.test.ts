import { describe, expect, it } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';
import { mock } from 'bun:test';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { CONFIG_EDITOR_KINDS, CONFIG_EDITOR_TITLE_KEYS, configEditorViewId, configKindOfViewId, isConfigEditorKind } =
  await import('./configEditors');
const { editorsProvider } = await import('../commands/paletteSources/editors');
const { SURFACES } = await import('../shell/surfaces');
const { isCommandId } = await import('../commands/registry');
const { en } = await import('../i18n/en');
const { es } = await import('../i18n/es');

describe('configuration editor kinds (UX-013, PLS-006)', () => {
  it('PLS-006 the plant map opens in the editor area as a configuration editor next to the I/O mapping', () => {
    const kinds = [...CONFIG_EDITOR_KINDS] as string[];
    expect(isConfigEditorKind('plantMap')).toBe(true);
    expect(kinds.indexOf('plantMap')).toBe(kinds.indexOf('io') + 1);
    expect(configEditorViewId('plantMap' as never)).toBe('config:plantMap');
    const key = CONFIG_EDITOR_TITLE_KEYS['plantMap' as never] as string;
    expect([typeof (en as Record<string, string>)[key], typeof (es as Record<string, string>)[key]]).toEqual(['string', 'string']);
    // a layout kept before the plant map existed reopens as it did; one that holds the plant map tab reopens it
    expect(configKindOfViewId('config:io')).toBe('io');
    expect(configKindOfViewId('config:plantMap')).toBe('plantMap');
    expect(configKindOfViewId('config:unknown')).toBeNull();
    expect(configKindOfViewId('file:Main.st')).toBeNull();
  });

  it('PLS-006 the plant map is listed by the palette and the surface registry', () => {
    const opened: string[] = [];
    const snapshot = { t: (k: string) => (en as Record<string, string>)[k] ?? k, open: { editor: (kind: string) => opened.push(kind) } };
    const items = editorsProvider(snapshot as never).items();
    const item = items.find((entry) => entry.key === 'editor:plantMap');
    expect(item?.title).toBe(en['configEditor.plantMap.title' as never]);
    item?.run();
    expect(opened).toEqual(['plantMap']);
    const surface = SURFACES.find((entry) => entry.id === 'editor.config.plantMap');
    expect(surface?.region).toBe('editor');
    expect(surface?.command).toBe('project.plantMap');
    expect(isCommandId('project.plantMap')).toBe(true);
  });
});
