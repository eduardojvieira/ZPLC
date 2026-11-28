import { describe, expect, it, mock } from 'bun:test';
import type { MessageKey } from '../i18n';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { useIDEStore } = await import('../store/useIDEStore');
const { bindCommands, resetCommandsForTest, runCommand } = await import('../commands/bus');
const { useNavigatorCommands } = await import('../commands/bind/navigator');
const { ObjectNavigatorView } = await import('./ObjectNavigator');
const { NavigatorDialogs } = await import('./NewObjectMenu');
const { useNavigatorRequests, askNew, askItem } = await import('./navigatorRequests');
const { Sidebar } = await import('../components/Sidebar');
const { buildNavigatorGroups } = await import('./navigatorGroups');
const { navigatorWords } = await import('./navigatorWords');
const { translatorFor } = await import('../i18n');

const words = navigatorWords(translatorFor('en'));
const config = { tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }] } as never;
const groupsOf = (withMain: boolean) =>
  buildNavigatorGroups(
    {
      declarations: withMain
        ? [{ file: 'src/Main.st', declarations: [{ name: 'Main', kind: 'PROGRAM', file: 'src/Main.st', line: 3, column: 9 }] }]
        : [],
      globals: [],
      fileTree: null,
      config,
    },
    words,
  );
const view = (groups = groupsOf(true)) => (
  <ObjectNavigatorView groups={groups} collapsed={new Set()} onToggle={() => undefined} onOpen={() => undefined} />
);
const group = (id: string) => document.querySelector(`[data-navigator-group="${id}"]`) as HTMLElement;
const reset = () => {
  resetCommandsForTest();
  useNavigatorRequests.setState({ creating: null, operation: null, subject: null, closing: false });
};

const file = (id: string, name: string) => ({ id, name, type: 'file' as const, path: `src/${name}`, language: 'ST' as const });
const tree = {
  id: 'root',
  name: 'P',
  type: 'directory' as const,
  path: '',
  isExpanded: true,
  children: [
    { id: 'src', name: 'src', type: 'directory' as const, path: 'src', isExpanded: true, children: [file('file:src/Main.st', 'Main.st')] },
  ],
};

describe('creation from the navigator (SHL-013)', () => {
  it('SHL-013 each group offers New for its kind', async () => {
    reset();
    const { user } = dom.render(view());
    const kinds = [
      ['functionBlocks', 'functionBlock'],
      ['functions', 'function'],
      ['dataTypes', 'dataType'],
      ['globals', 'globals'],
      ['tasks', 'task'],
    ] as const;
    for (const [id, kind] of kinds) {
      const title = dom.t(`navigator.group.${id}` as MessageKey);
      await user.click(dom.within(group(id)).getByRole('button', { name: dom.t('newObject.newIn', { group: title }) }));
      expect(useNavigatorRequests.getState().creating?.kind).toBe(kind);
    }
    // a program asks for its language first, in a menu
    await user.click(
      dom.within(group('programs')).getByRole('button', { name: dom.t('newObject.newIn', { group: dom.t('navigator.group.programs') }) }),
    );
    await user.click(dom.screen.getByRole('menuitem', { name: dom.t('newObject.language.LD') }));
    expect(useNavigatorRequests.getState().creating).toEqual({ kind: 'program', language: 'LD' });
    // the groups of the project file create nothing
    expect(dom.within(group('io')).queryByRole('button', { name: /New|Nuevo/ })).toBeNull();
  });

  it('UX-021 an empty group shows the New action', async () => {
    reset();
    const { user } = dom.render(view(groupsOf(false)));
    const empty = dom.within(group('functions'));
    expect(empty.queryByText(dom.t('navigator.empty'))).toBeNull();
    await user.click(empty.getByRole('button', { name: dom.t('newObject.title.function') }));
    expect(useNavigatorRequests.getState().creating?.kind).toBe('function');
  });

  it('SHL-013 rename, move, duplicate and delete work from the object view', async () => {
    reset();
    const ran: string[] = [];
    bindCommands({
      'project.rename': () => void ran.push('rename'),
      'project.moveFile': () => void ran.push('move'),
      'project.duplicate': () => void ran.push('duplicate'),
      'project.delete': () => void ran.push('delete'),
    });
    const { user } = dom.render(view());
    const row = () => dom.within(group('programs'));
    for (const key of ['rename', 'moveFile', 'duplicate', 'delete'] as const) {
      await user.click(row().getByRole('button', { name: dom.t('newObject.itemActions', { name: 'Main' }) }));
      await user.click(dom.screen.getByRole('menuitem', { name: dom.t(`command.project.${key}` as MessageKey) }));
      expect(useNavigatorRequests.getState().subject).toEqual({ kind: 'path', path: 'src/Main.st' });
    }
    expect(ran).toEqual(['rename', 'move', 'duplicate', 'delete']);
    // a task row is renamed in place: nothing else is offered
    await user.click(dom.within(group('tasks')).getByRole('button', { name: dom.t('newObject.itemActions', { name: 'MainTask' }) }));
    expect(dom.screen.getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual([dom.t('command.project.rename')]);
  });

  it('SHL-013 creating a function block makes the file with its skeleton and opens it at its declaration', async () => {
    reset();
    const createFile = mock<(name: string, language: string, parent: string, content: string) => Promise<string>>(
      async () => 'file:src/Pump.st',
    );
    const navigate = mock<(path: string, line: number, column: number) => Promise<boolean>>(async () => true);
    dom.patchStore(useIDEStore, {
      fileTree: tree as never,
      projectConfig: config,
      loadedFiles: new Map([['file:src/Pump.st', { path: 'src/Pump.st' }]]) as never,
      createFile,
      navigateToCompilerDiagnostic: navigate,
    } as never);
    const { user } = dom.render(<NavigatorDialogs />);
    dom.act(() => askNew('functionBlock'));
    await user.type(dom.screen.getByRole('textbox', { name: dom.t('newObject.name') }), '2bad');
    await user.click(dom.screen.getByRole('button', { name: dom.t('newObject.create') }));
    expect((await dom.screen.findByText(dom.t('newObject.name.invalid', { name: '2bad' }))).textContent).toContain('2bad');
    expect(createFile).not.toHaveBeenCalled();
    const input = dom.screen.getByRole('textbox', { name: dom.t('newObject.name') });
    await user.clear(input);
    await user.type(input, 'Pump{Enter}');
    await dom.waitFor(() => expect(navigate).toHaveBeenCalledWith('src/Pump.st', 1, 1));
    expect(createFile.mock.calls[0]!.slice(0, 3)).toEqual(['Pump.st', 'ST', 'src']);
    expect(createFile.mock.calls[0]![3]).toContain('FUNCTION_BLOCK Pump');
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });

  it('SHL-013 delete asks first and loses nothing when it is cancelled; the file is named as unsaved when it is', async () => {
    reset();
    const deleteFile = mock<(id: string) => Promise<boolean>>(async () => true);
    dom.patchStore(useIDEStore, {
      fileTree: tree as never,
      loadedFiles: new Map([['file:src/Main.st', { path: 'src/Main.st', isModified: true }]]) as never,
      deleteFile,
    } as never);
    const { user } = dom.render(<NavigatorDialogs />);
    dom.act(() => askItem('delete', { kind: 'path', path: 'src/Main.st' }));
    const dialog = dom.screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain(dom.t('newObject.deleteBodyModified', { file: 'src/Main.st' }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('common.cancel') }));
    expect(deleteFile).not.toHaveBeenCalled();
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
    dom.act(() => askItem('delete', { kind: 'path', path: 'src/Main.st' }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('newObject.deleteAction') }));
    expect(deleteFile).toHaveBeenCalledWith('file:src/Main.st');
  });

  it('SHL-013 rename keeps the file through the store and a task is renamed in place', async () => {
    reset();
    const renameEntry = mock<(path: string, name: string) => Promise<void>>(async () => undefined);
    const updateProjectConfig = mock<(updates: unknown) => void>(() => undefined);
    const saveProjectConfig = mock(async () => undefined);
    dom.patchStore(useIDEStore, {
      fileTree: tree as never,
      projectConfig: config,
      renameEntry,
      updateProjectConfig,
      saveProjectConfig,
    } as never);
    const { user } = dom.render(<NavigatorDialogs />);
    dom.act(() => askItem('rename', { kind: 'path', path: 'src/Main.st' }));
    const input = dom.screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Boiler.st{Enter}');
    await dom.waitFor(() => expect(renameEntry).toHaveBeenCalledWith('src/Main.st', 'Boiler.st'));
    dom.act(() => askItem('rename', { kind: 'task', index: 0 }));
    const taskName = dom.screen.getByRole('textbox');
    await user.clear(taskName);
    await user.type(taskName, 'Fast{Enter}');
    await dom.waitFor(() => expect(saveProjectConfig).toHaveBeenCalled());
    expect((updateProjectConfig.mock.calls[0]![0] as { tasks: Array<{ name: string; programs: string[] }> }).tasks[0]).toMatchObject({
      name: 'Fast',
      programs: ['main.st'],
    });
  });

  it('SHL-013 Close project is a File menu command and not a control beside Refresh', async () => {
    reset();
    function Binder() {
      useNavigatorCommands();
      return null;
    }
    const closeProject = mock(() => true);
    const hasUnsavedChanges = mock(() => false);
    dom.patchStore(useIDEStore, { fileTree: tree as never, projectName: 'P', closeProject, hasUnsavedChanges } as never);
    const { user } = dom.render(
      <>
        <Binder />
        <Sidebar />
        <NavigatorDialogs />
      </>,
    );
    expect(dom.screen.queryByRole('button', { name: dom.t('explorer.closeProject') })).toBeNull();
    expect(dom.screen.getByRole('button', { name: dom.t('explorer.refresh') })).toBeTruthy();
    runCommand('file.closeProject');
    expect(closeProject).toHaveBeenCalledTimes(1);
    // unsaved work: asks, and a cancel closes nothing (IDE-005)
    hasUnsavedChanges.mockReturnValue(true);
    dom.act(() => void runCommand('file.closeProject'));
    expect(closeProject).toHaveBeenCalledTimes(1);
    await user.click(dom.screen.getByRole('button', { name: dom.t('closeProject.continue') }));
    expect(closeProject).toHaveBeenCalledTimes(1);
    expect(dom.screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the place bar shows the navigator (FND-007)', () => {
  it('FND-007 a reveal request expands a collapsed group and focuses the item', async () => {
    reset();
    const { useProjectSources } = await import('../store/projectSources');
    const { useNavigatorReveal } = await import('../store/useNavigationHistory');
    const { ObjectNavigator } = await import('./ObjectNavigator');
    dom.patchStore(useIDEStore, { projectConfig: config, fileTree: null } as never);
    dom.patchStore(useProjectSources, { declarations: groupsDeclarations() as never });
    const { user } = dom.render(<ObjectNavigator />);
    const header = () => dom.within(group('programs')).getAllByRole('button')[0]!;
    await user.click(header());
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(group('programs').querySelector('[data-navigator-item]')).toBeNull();
    dom.act(() => useNavigatorReveal.getState().reveal('programs', 'PROGRAM:src/Main.st:Main'));
    await dom.waitFor(() => expect(header().getAttribute('aria-expanded')).toBe('true'));
    const item = document.querySelector('[data-navigator-item="PROGRAM:src/Main.st:Main"]') as HTMLElement;
    expect(item).not.toBeNull();
    await dom.waitFor(() => expect(document.activeElement).toBe(item));
    useNavigatorReveal.setState({ group: null, item: null });
  });
});

function groupsDeclarations() {
  return [{ file: 'src/Main.st', declarations: [{ name: 'Main', kind: 'PROGRAM', file: 'src/Main.st', line: 3, column: 9 }] }];
}

describe('a shortened task row can be read whole (UXV-004)', () => {
  const long = {
    tasks: [{ name: 'MainTaskWithAVeryLongName', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
  } as never;
  const longGroups = () => buildNavigatorGroups({ declarations: [], globals: [], fileTree: null, config: long }, words);
  const full = () => {
    const task = longGroups().find((g) => g.id === 'tasks')!.items[0]!;
    return `${task.label} — ${task.detail}`;
  };
  const row = () => group('tasks').querySelector('[data-navigator-item]') as HTMLElement;

  it('UXV-004 the task row carries its full name and schedule, and shows them on hover', async () => {
    reset();
    const { user } = dom.render(<div style={{ width: '120px' }}>{view(longGroups())}</div>);
    expect(row().getAttribute('data-tooltip')).toBe(full());
    await user.hover(row());
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toBe(full()));
    expect(row().getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
  });

  it('UXV-004 the task row shows its full text on keyboard focus', async () => {
    reset();
    dom.render(<div style={{ width: '120px' }}>{view(longGroups())}</div>);
    row().focus();
    await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toBe(full()));
    expect(row().getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
  });
});

describe('the Plant group of the navigator (PLS-011)', () => {
  const plantModel = (
    items: { key: string; label?: string; ref: never }[],
    onAdd: (template: string, name: string) => Promise<void> = async () => undefined,
  ) => ({
    items,
    templates: [
      { value: 'empty', label: 'Empty floor' },
      { value: 'timed-tank', label: 'Timed tank' },
    ],
    existing: [],
    onOpen: () => undefined,
    onAdd,
  });
  const withPlant = (plant: ReturnType<typeof plantModel>) => (
    <ObjectNavigatorView groups={groupsOf(true)} collapsed={new Set()} onToggle={() => undefined} onOpen={() => undefined} plant={plant} />
  );

  it('PLS-011 the navigator shows a Plant group with the scene and the plant map when the project has a plant', () => {
    const { unmount } = dom.render(
      withPlant(
        plantModel([
          { key: 'scene:root', label: 'scene.json', ref: { kind: 'project' } as never },
          { key: 'plant-map', ref: { kind: 'project' } as never },
        ]),
      ),
    );
    const plant = dom.within(group('plant'));
    expect(plant.getByText('scene.json')).toBeTruthy();
    expect(plant.getByText(dom.t('navigator.plant.map'))).toBeTruthy();
    unmount();
  });

  it('PLS-011 a project with no plant offers Add a plant with the empty floor and every shipped scene', async () => {
    const { user } = dom.render(withPlant(plantModel([])));
    await user.click(dom.within(group('plant')).getByRole('button', { name: dom.t('plant.activity.add') }));
    const options = dom.within(dom.screen.getByRole('dialog')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Empty floor', 'Timed tank']);
  });

  it('PLS-011 Add a plant saves the template under a name and opens it', async () => {
    const onAdd = mock<(template: string, name: string) => Promise<void>>(async () => undefined);
    const { user } = dom.render(withPlant(plantModel([], onAdd)));
    await user.click(dom.within(group('plant')).getByRole('button', { name: dom.t('plant.activity.add') }));
    const dialog = dom.within(dom.screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByRole('combobox'), 'timed-tank');
    const name = dialog.getByRole('textbox', { name: dom.t('plant.panel.saveName') });
    await user.clear(name);
    await user.type(name, 'my tank');
    await user.click(dialog.getByRole('button', { name: dom.t('navigator.plant.create') }));
    expect(onAdd).toHaveBeenCalledWith('timed-tank', 'my tank');
  });

  it('PLS-011 a project with a scene shows no Add a plant', () => {
    dom.render(withPlant(plantModel([{ key: 'scene:root', label: 'scene.json', ref: { kind: 'project' } as never }])));
    expect(dom.within(group('plant')).queryByRole('button', { name: dom.t('plant.activity.add') })).toBeNull();
  });
});
