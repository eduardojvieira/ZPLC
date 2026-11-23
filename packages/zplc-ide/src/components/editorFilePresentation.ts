import type { FileLanguage } from '../types';

/** Visual editors persist JSON models, but tabs present the PLC language file. */
export function displayEditorFileName(name: string, language: FileLanguage): string {
  return ['FBD', 'LD', 'SFC'].includes(language) ? name.replace(/\.json$/i, '') : name;
}
