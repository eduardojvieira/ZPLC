/**
 * The registry of Studio surfaces (SHL-001, SHL-002): every place the shell shows something, with the one region it has
 * today and the command that shows it. The rail (`ActivityRail.tsx`) and the results tab strip (`Console.tsx`) keep their own
 * lists and a test compares them with this one, since tabs are still moving (spec 013, W3 and U2).
 */
import type { MessageKey } from '../i18n';
import type { CommandId } from '../commands/registry';
import { CONFIG_EDITOR_KINDS, CONFIG_EDITOR_TITLE_KEYS } from '../navigator/configEditors';

export type Region = 'commandBar' | 'activity' | 'editor' | 'secondary' | 'results' | 'status' | 'dialog';
export interface Surface {
  id: string;
  titleKey: MessageKey;
  region: Region;
  command: CommandId;
}

const activity = (view: string, command: CommandId): Surface => ({
  id: `activity.${view}`,
  titleKey: `shell.activity.${view}` as MessageKey,
  region: 'activity',
  command,
});
const tab = (id: string, titleKey: MessageKey, command: CommandId): Surface => ({
  id: `results.${id}`,
  titleKey,
  region: 'results',
  command,
});

export const SURFACES: readonly Surface[] = [
  activity('project', 'view.showProject'),
  activity('search', 'view.showSearch'),
  activity('tests', 'view.tests'),
  activity('learn', 'view.showLearn'),
  { id: 'secondary.inspector', titleKey: 'shell.secondary.inspector', region: 'secondary', command: 'view.toggleSecondarySidebar' },
  tab('output', 'panel.output', 'view.output'),
  tab('problems', 'panel.problems', 'view.problems'),
  tab('tests', 'panel.tests', 'view.tests'),
  tab('interlocks', 'console.tab.interlocks', 'view.interlocks'),
  tab('changes', 'console.tab.changes', 'view.changes'),
  tab('agent', 'console.tab.agent', 'view.agent'),
  tab('trace', 'panel.trace', 'view.trace'),
  tab('watch', 'panel.watch', 'view.watch'),
  tab('terminal', 'console.tab.terminal', 'view.terminal'),
  ...CONFIG_EDITOR_KINDS.map((kind): Surface => ({
    id: `editor.config.${kind}`,
    titleKey: CONFIG_EDITOR_TITLE_KEYS[kind],
    region: 'editor',
    command: `project.${kind}`,
  })),
  { id: 'editor.settings', titleKey: 'studio.surface.settings', region: 'editor', command: 'project.settings' },
  { id: 'editor.learn', titleKey: 'studio.surface.learn', region: 'editor', command: 'help.learn' },
  { id: 'editor.plant', titleKey: 'studio.surface.plant', region: 'editor', command: 'view.plant' },
  { id: 'dialog.palette', titleKey: 'studio.surface.palette', region: 'dialog', command: 'view.commandPalette' },
  { id: 'dialog.shortcuts', titleKey: 'studio.surface.shortcuts', region: 'dialog', command: 'help.shortcuts' },
];

export const surfacesIn = (region: Region): readonly Surface[] => SURFACES.filter((surface) => surface.region === region);
