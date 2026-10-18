/**
 * The configuration editors of a project (UX-013): each one is a tab of the editor area, opened from the project
 * navigator, and edits one part of `zplc.json`.
 */
export const CONFIG_EDITOR_KINDS = ['tasks', 'io', 'network', 'communication', 'target'] as const;
export type ConfigEditorKind = (typeof CONFIG_EDITOR_KINDS)[number];

export const isConfigEditorKind = (value: unknown): value is ConfigEditorKind =>
  typeof value === 'string' && (CONFIG_EDITOR_KINDS as readonly string[]).includes(value);
