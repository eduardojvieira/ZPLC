/**
 * The configuration editors of a project (UX-013): each one is a tab of the editor area, opened from the project
 * navigator, and edits one part of `zplc.json`.
 */
import type { MessageKey } from '../i18n';

export const CONFIG_EDITOR_KINDS = ['tasks', 'io', 'network', 'communication', 'target'] as const;
export type ConfigEditorKind = (typeof CONFIG_EDITOR_KINDS)[number];

export const isConfigEditorKind = (value: unknown): value is ConfigEditorKind =>
  typeof value === 'string' && (CONFIG_EDITOR_KINDS as readonly string[]).includes(value);

export const CONFIG_EDITOR_TITLE_KEYS: Record<ConfigEditorKind, MessageKey> = {
  tasks: 'configEditor.tasks.title',
  io: 'configEditor.io.title',
  network: 'configEditor.network.title',
  communication: 'configEditor.communication.title',
  target: 'configEditor.target.title',
};

/** The id of the tab of an editor, which is also what the editor area calls the view. */
export const configEditorViewId = (kind: ConfigEditorKind): string => `config:${kind}`;

/**
 * Whether closing a configuration tab asks first. The configuration is one document, `zplc.json`, held in memory and shared
 * by every view of it: while another tab shows it, closing this one loses nothing, and the last one to close asks.
 */
export const configCloseNeedsConfirmation = (configDirty: boolean, otherViewsOfConfiguration: number): boolean =>
  configDirty && otherViewsOfConfiguration === 0;
