/**
 * The command registry of Studio (UX-015): every command is declared here once, and the application menu, the command
 * palette, the shortcut hints of the tooltips, the shortcut reference and the keyboard handler all read this table.
 *
 * A definition is data: its id, the key of its title in the catalogs, its category (the menu it belongs to), its default
 * shortcut and whether it is available in a state of the application. What a command does lives with the code that owns
 * the behaviour, which binds it with `bindCommands` (bus.ts); a human control surface (the menu, the palette, a shortcut)
 * runs it through `runCommand`. This module imports nothing from React or Electron, so the main process bundles it to
 * build the menu (`menuEntry.ts`). The MCP server and the AI provider have no access to it: a command that touches a
 * device (`physical`) is a control for the person at the keyboard, and goes through the same confirmation and gates as the
 * button of the toolbar it stands for.
 */
import type { MessageKey } from '../i18n/en';

export const COMMAND_CATEGORIES = ['file', 'edit', 'view', 'project', 'build', 'online', 'debug', 'help'] as const;
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

/** The state of the application that decides whether a command is offered (published by the shell, see bus.ts). */
export interface CommandState {
  projectOpen: boolean;
  hasActiveFile: boolean;
  /** The active file is a Ladder, FBD or SFC diagram. */
  visualFile: boolean;
  mode: 'simulate' | 'hardware';
  connected: boolean;
  vmState: string;
  /** The last build is of the current source. */
  compiled: boolean;
  /** A connection, a mode change or a deploy is in progress. */
  busy: boolean;
}

export const INITIAL_COMMAND_STATE: CommandState = {
  projectOpen: false,
  hasActiveFile: false,
  visualFile: false,
  mode: 'simulate',
  connected: false,
  vmState: 'idle',
  compiled: false,
  busy: false,
};

export interface CommandDefinition {
  readonly id: string;
  readonly titleKey: MessageKey;
  readonly category: CommandCategory;
  /** The default shortcut: `Mod+S`, `Shift+F5`, or two steps such as `Mod+K Mod+S`. */
  readonly shortcut?: string;
  /** It acts on a device or on the running program; it is run by a person, through the same gates as its button. */
  readonly physical?: boolean;
  /** Whether the menu and the palette offer it now; absent means always. The handler keeps its own checks and messages. */
  readonly enabled?: (state: CommandState) => boolean;
}

const open = (s: CommandState): boolean => s.projectOpen;
const idle = (s: CommandState): boolean => s.projectOpen && !s.busy;
const online = (s: CommandState): boolean => s.connected && !s.busy;
const stoppable = (s: CommandState): boolean => online(s) && (s.vmState === 'running' || s.vmState === 'paused');

export const COMMANDS = [
  { id: 'file.save', titleKey: 'command.file.save', category: 'file', shortcut: 'Mod+S', enabled: (s) => s.hasActiveFile },
  { id: 'file.open', titleKey: 'command.file.open', category: 'file' },
  { id: 'file.new', titleKey: 'command.file.new', category: 'file' },
  { id: 'file.export', titleKey: 'command.file.export', category: 'file', enabled: open },

  { id: 'view.commandPalette', titleKey: 'command.view.commandPalette', category: 'view', shortcut: 'Mod+Shift+P' },
  {
    id: 'view.togglePrimarySidebar',
    titleKey: 'command.view.togglePrimarySidebar',
    category: 'view',
    shortcut: 'Mod+Alt+B',
    enabled: open,
  },
  {
    id: 'view.toggleSecondarySidebar',
    titleKey: 'command.view.toggleSecondarySidebar',
    category: 'view',
    shortcut: 'Mod+Alt+I',
    enabled: open,
  },
  { id: 'view.toggleConsole', titleKey: 'command.view.toggleConsole', category: 'view', shortcut: 'Mod+Alt+J', enabled: open },
  { id: 'view.showProject', titleKey: 'command.view.showProject', category: 'view', shortcut: 'Mod+Shift+E', enabled: open },
  { id: 'view.showSearch', titleKey: 'command.view.showSearch', category: 'view', shortcut: 'Mod+Shift+F', enabled: open },
  { id: 'view.showLearn', titleKey: 'command.view.showLearn', category: 'view', enabled: open },
  { id: 'view.output', titleKey: 'command.view.output', category: 'view', enabled: open },
  { id: 'view.problems', titleKey: 'command.view.problems', category: 'view', enabled: open },
  { id: 'view.tests', titleKey: 'command.view.tests', category: 'view', enabled: open },
  { id: 'view.trace', titleKey: 'command.view.trace', category: 'view', enabled: open },
  { id: 'view.watch', titleKey: 'command.view.watch', category: 'view', enabled: open },
  { id: 'view.themeLight', titleKey: 'command.view.themeLight', category: 'view' },
  { id: 'view.themeDark', titleKey: 'command.view.themeDark', category: 'view' },
  { id: 'view.themeHighContrast', titleKey: 'command.view.themeHighContrast', category: 'view' },
  { id: 'view.themeSystem', titleKey: 'command.view.themeSystem', category: 'view' },

  { id: 'project.settings', titleKey: 'command.project.settings', category: 'project', enabled: open },

  { id: 'build.compile', titleKey: 'command.build.compile', category: 'build', shortcut: 'Mod+B', enabled: open },
  { id: 'build.generateSt', titleKey: 'command.build.generateSt', category: 'build', enabled: (s) => s.visualFile },
  { id: 'build.downloadProgram', titleKey: 'command.build.downloadProgram', category: 'build', enabled: (s) => s.compiled },
  { id: 'build.viewAssembly', titleKey: 'command.build.viewAssembly', category: 'build', enabled: (s) => s.compiled },

  { id: 'online.simulation', titleKey: 'command.online.simulation', category: 'online', enabled: (s) => idle(s) && s.mode !== 'simulate' },
  {
    id: 'online.hardware',
    titleKey: 'command.online.hardware',
    category: 'online',
    enabled: (s) => idle(s) && s.mode !== 'hardware',
  },
  {
    id: 'online.connect',
    titleKey: 'command.online.connect',
    category: 'online',
    physical: true,
    enabled: (s) => s.mode === 'hardware' && idle(s) && !s.connected,
  },
  {
    id: 'online.disconnect',
    titleKey: 'command.online.disconnect',
    category: 'online',
    physical: true,
    enabled: (s) => s.mode === 'hardware' && online(s),
  },
  {
    id: 'online.deploy',
    titleKey: 'command.online.deploy',
    category: 'online',
    physical: true,
    enabled: (s) => online(s) && s.mode === 'hardware' && s.compiled,
  },

  {
    id: 'debug.run',
    titleKey: 'command.debug.run',
    category: 'debug',
    shortcut: 'F5',
    physical: true,
    // In simulation Run starts the session itself (FLW-001, FLW-014): the palette offers it with no session, as the button does.
    enabled: (s) => (s.mode === 'simulate' ? idle(s) : online(s)) && s.vmState !== 'running',
  },
  {
    id: 'debug.pause',
    titleKey: 'command.debug.pause',
    category: 'debug',
    shortcut: 'F6',
    physical: true,
    enabled: (s) => online(s) && s.vmState === 'running',
  },
  { id: 'debug.stop', titleKey: 'command.debug.stop', category: 'debug', shortcut: 'Shift+F5', physical: true, enabled: stoppable },
  {
    id: 'debug.step',
    titleKey: 'command.debug.step',
    category: 'debug',
    shortcut: 'F10',
    physical: true,
    enabled: (s) => online(s) && (s.vmState === 'paused' || s.vmState === 'idle'),
  },
  { id: 'debug.reset', titleKey: 'command.debug.reset', category: 'debug', shortcut: 'F8', physical: true, enabled: online },
  { id: 'debug.liveValues', titleKey: 'command.debug.liveValues', category: 'debug', enabled: online },

  // Lane W of the M1 plan (spec 013): declared here by task W0 with no handler; the task named in plan-m1.md binds each one.
  { id: 'file.saveAll', titleKey: 'command.file.saveAll', category: 'file', enabled: open },
  { id: 'view.splitRight', titleKey: 'command.view.splitRight', category: 'view', enabled: open },
  { id: 'view.moveToOtherGroup', titleKey: 'command.view.moveToOtherGroup', category: 'view', enabled: open },
  { id: 'view.focusOtherGroup', titleKey: 'command.view.focusOtherGroup', category: 'view', enabled: open },
  { id: 'view.maximiseDocument', titleKey: 'command.view.maximiseDocument', category: 'view', enabled: open },
  { id: 'view.plant', titleKey: 'command.view.plant', category: 'view', enabled: open },
  { id: 'view.interlocks', titleKey: 'command.view.interlocks', category: 'view', enabled: open },
  { id: 'view.changes', titleKey: 'command.view.changes', category: 'view', enabled: open },
  { id: 'view.agent', titleKey: 'command.view.agent', category: 'view', enabled: open },
  { id: 'view.terminal', titleKey: 'command.view.terminal', category: 'view', enabled: open },
  { id: 'view.statusDetails', titleKey: 'command.view.statusDetails', category: 'view', enabled: open },
  { id: 'project.tasks', titleKey: 'command.project.tasks', category: 'project', enabled: open },
  { id: 'project.io', titleKey: 'command.project.io', category: 'project', enabled: open },
  { id: 'project.network', titleKey: 'command.project.network', category: 'project', enabled: open },
  { id: 'project.communication', titleKey: 'command.project.communication', category: 'project', enabled: open },
  { id: 'project.target', titleKey: 'command.project.target', category: 'project', enabled: open },
  { id: 'online.restartSimulator', titleKey: 'command.online.restartSimulator', category: 'online', enabled: idle },
  { id: 'debug.rebuildAndRestart', titleKey: 'command.debug.rebuildAndRestart', category: 'debug', enabled: idle },

  { id: 'help.shortcuts', titleKey: 'command.help.shortcuts', category: 'help', shortcut: 'Mod+K Mod+S' },
  // The Learn home opens with no project open: the Help menu is where a person who has not opened one looks (LRN-001).
  { id: 'help.learn', titleKey: 'command.help.learn', category: 'help' },

  // Milestone U2 of spec 013 (plan-u2.md, C-X): declared by task X0b with no handler; the task named in the plan binds each one.
  // Appended after the commands of 2.0 and of lane W, never before them: commands.test.ts pins their order.
  { id: 'view.testResults', titleKey: 'command.view.testResults', category: 'view', enabled: open },
  { id: 'view.resetLayout', titleKey: 'command.view.resetLayout', category: 'view', enabled: open },
  { id: 'view.showInspector', titleKey: 'command.view.showInspector', category: 'view', enabled: open },
  { id: 'file.closeProject', titleKey: 'command.file.closeProject', category: 'file', enabled: open },
  { id: 'file.preferences', titleKey: 'command.file.preferences', category: 'file', shortcut: 'Mod+Comma' },
  { id: 'build.runAllTests', titleKey: 'command.build.runAllTests', category: 'build', shortcut: 'Mod+Alt+T', enabled: open },
  { id: 'build.runFailedTests', titleKey: 'command.build.runFailedTests', category: 'build', enabled: open },
  { id: 'build.runTestAtCursor', titleKey: 'command.build.runTestAtCursor', category: 'build', enabled: open },
  { id: 'build.newTest', titleKey: 'command.build.newTest', category: 'build', enabled: open },
  { id: 'build.checkInterlocks', titleKey: 'command.build.checkInterlocks', category: 'build', enabled: open },
  { id: 'edit.goToDefinition', titleKey: 'command.edit.goToDefinition', category: 'edit', shortcut: 'F12', enabled: open },
  { id: 'edit.findAllReferences', titleKey: 'command.edit.findAllReferences', category: 'edit', shortcut: 'Shift+F12', enabled: open },
  { id: 'edit.goBack', titleKey: 'command.edit.goBack', category: 'edit', shortcut: 'Alt+Left' },
  { id: 'edit.goForward', titleKey: 'command.edit.goForward', category: 'edit', shortcut: 'Alt+Right' },
  { id: 'project.newProgram', titleKey: 'command.project.newProgram', category: 'project', enabled: open },
  { id: 'project.newFunctionBlock', titleKey: 'command.project.newFunctionBlock', category: 'project', enabled: open },
  { id: 'project.newFunction', titleKey: 'command.project.newFunction', category: 'project', enabled: open },
  { id: 'project.newDataType', titleKey: 'command.project.newDataType', category: 'project', enabled: open },
  { id: 'project.newGlobals', titleKey: 'command.project.newGlobals', category: 'project', enabled: open },
  { id: 'project.newTask', titleKey: 'command.project.newTask', category: 'project', enabled: open },
  { id: 'project.rename', titleKey: 'command.project.rename', category: 'project', enabled: open },
  { id: 'project.moveFile', titleKey: 'command.project.moveFile', category: 'project', enabled: open },
  { id: 'project.duplicate', titleKey: 'command.project.duplicate', category: 'project', enabled: open },
  { id: 'project.delete', titleKey: 'command.project.delete', category: 'project', enabled: open },
] as const satisfies readonly CommandDefinition[];

export type CommandId = (typeof COMMANDS)[number]['id'];

/** The registered commands as the general type, for code that does not need the literal ids. */
export const COMMAND_LIST: readonly CommandDefinition[] = COMMANDS;

const BY_ID: ReadonlyMap<string, CommandDefinition> = new Map(COMMAND_LIST.map((command) => [command.id, command]));

/** The closed list: only a registered id may cross from the menu to the window or be run. */
export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function commandById(id: CommandId): CommandDefinition {
  return BY_ID.get(id)!;
}

export function isCommandEnabled(command: CommandDefinition, state: CommandState): boolean {
  return command.enabled ? command.enabled(state) : true;
}

export function commandsIn(category: CommandCategory): readonly CommandDefinition[] {
  return COMMAND_LIST.filter((command) => command.category === category);
}

export const MENU_TITLE_KEYS: Record<CommandCategory, MessageKey> = {
  file: 'menu.file',
  edit: 'menu.edit',
  view: 'menu.view',
  project: 'menu.project',
  build: 'menu.build',
  online: 'menu.online',
  debug: 'menu.debug',
  help: 'menu.help',
};
