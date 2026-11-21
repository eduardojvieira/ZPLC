import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';

// SHL-011: Project settings is the project's document: its metadata and the entries to the editors of its configuration.
const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../../store/useIDEStore');
const { ProjectSettings } = await import('./ProjectSettings');
const { CONFIG_EDITOR_KINDS } = await import('../../navigator/configEditors');

describe('Project settings (SHL-011) in a DOM', () => {
  it('SHL-011 Project settings keeps the metadata and the editor entries', () => {
    dom.patchStore(useIDEStore, {
      projectConfig: { name: 'plant', version: '1.0.0', tasks: [] } as never,
      saveProjectConfig: async () => undefined,
    });
    const view = dom.render(<ProjectSettings />);
    expect(view.getByRole('button', { name: dom.t('project.saveConfig') })).toBeTruthy();
    expect((view.getByLabelText(dom.t('settings.metadata.name')) as HTMLInputElement).value).toBe('plant');
    expect(view.container.querySelectorAll('[data-open-config-editor]')).toHaveLength(CONFIG_EDITOR_KINDS.length);
    expect(view.getByText(dom.t('project.settings.scope'))).toBeTruthy();
  });
});
