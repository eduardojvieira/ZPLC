import type { FileLanguage } from '../types';

export function canCommitVisualEditorChange(
  currentProjectSession: number,
  expectedProjectSession: number,
  activeFileId: string | null,
  expectedFileId: string,
  expectedLanguage: FileLanguage,
  file: { id: string; language: FileLanguage } | undefined,
): boolean {
  return (
    currentProjectSession === expectedProjectSession &&
    activeFileId === expectedFileId &&
    file?.id === expectedFileId &&
    file.language === expectedLanguage
  );
}
