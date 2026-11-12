/**
 * The documents of the editor area (spec 013, SHL-006). A view id is a file id (`file:<path>`), `'settings'`, `'config:<kind>'`
 * (`navigator/configEditors.ts`) or `PLANT_VIEW_ID`; the editor groups only move ids around and never look inside one.
 */
import { PLC_LANGUAGES, type PLCLanguage } from '../types';

export type ViewId = string;
export const SETTINGS_VIEW_ID: ViewId = 'settings';
/** The plant document (spec 013 PLS-001): `shell/PlantDocument.tsx`, opened by `view.plant`. */
export const PLANT_VIEW_ID: ViewId = 'plant';

/** The languages edited as text in Monaco; every other language of the project has a visual editor (LD, FBD, SFC). */
export const isVisualWorkflow = (language: PLCLanguage): boolean =>
  language !== 'ST' && language !== 'IL' && PLC_LANGUAGES[language]?.isVisual === true;
