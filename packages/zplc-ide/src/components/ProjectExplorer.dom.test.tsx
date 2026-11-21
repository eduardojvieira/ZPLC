import { afterEach, describe, expect, it, mock } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

// FND-002, SHL-011: the root of the navigator has an entry for Project settings, which is a command.
const dom = await setupDom();
await stubProjectLoader();
const { ProjectExplorer } = await import('./ProjectExplorer');
const { bindCommands, resetCommandsForTest } = await import('../commands/bus');
const { useShellLayout } = await import('../store/useShellLayout');

afterEach(() => resetCommandsForTest());

describe('Project explorer root (FND-002) in a DOM', () => {
  for (const mode of ['objects', 'files'] as const) {
    it(`SHL-011 the root of the navigator opens Project settings in the ${mode} mode`, async () => {
      dom.patchStore(useShellLayout, { navigatorMode: mode });
      const run = mock(() => undefined);
      bindCommands({ 'project.settings': run });
      const { user } = dom.render(<ProjectExplorer />);
      const entry = dom.screen.getByRole('button', { name: dom.t('command.project.settings') });
      expect(entry.getAttribute('data-command')).toBe('project.settings');
      await user.click(entry);
      expect(run).toHaveBeenCalledTimes(1);
    });
  }
});
