import type { PLCLanguage } from '../types';

export function canCommitVisualEditorChange(
  currentProjectSession: number,
  expectedProjectSession: number,
  activeFileId: string | null,
  expectedFileId: string,
  expectedLanguage: PLCLanguage,
  file: { id: string; language: PLCLanguage } | undefined,
): boolean {
  return currentProjectSession === expectedProjectSession
    && activeFileId === expectedFileId
    && file?.id === expectedFileId
    && file.language === expectedLanguage;
}
