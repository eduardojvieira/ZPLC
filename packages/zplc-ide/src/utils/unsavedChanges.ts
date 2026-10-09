/** What a user can answer when closing would lose modified files. */
export type UnsavedChoice = 'save' | 'discard' | 'cancel';

/**
 * `stillModified` is read after a save attempt: a save that left files modified (a write failed)
 * must not close anything, so the work stays open and visible.
 */
export function unsavedOutcome(choice: UnsavedChoice, stillModified: boolean): 'proceed' | 'stay' {
  if (choice === 'cancel') return 'stay';
  if (choice === 'save' && stillModified) return 'stay';
  return 'proceed';
}

/** Names shown in the prompt: modified files in order, then the project configuration. */
export function unsavedItems(files: Iterable<{ name: string; isModified: boolean }>, projectConfigDirty: boolean): string[] {
  const items = [...files].filter((file) => file.isModified).map((file) => file.name);
  return projectConfigDirty ? [...items, 'Project settings (zplc.json)'] : items;
}
