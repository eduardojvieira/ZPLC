/**
 * @file newProject.ts
 * @brief What a new project is made of (IDE-009): the choices the dialog offers, the first program in the language
 * chosen, and the configuration that points the main task at it. Pure, so the choices are tested without a folder.
 */

import { BOARD_OPTIONS } from '../config/boardProfiles';
import { DEFAULT_ZPLC_CONFIG, createEmptyFileContent, getExtensionForLanguage, type PLCLanguage, type ZPLCProjectV2 } from '../types';

export const NEW_PROJECT_LANGUAGES: readonly PLCLanguage[] = ['ST', 'IL', 'LD', 'FBD', 'SFC'];
/** The target of a project that runs on this computer only. */
export const SIMULATION_TARGET = 'simulation';
export const PROJECT_NAME_MAX = 64;

export interface NewProjectChoices { target: string; language: PLCLanguage }
/** What the New project dialog hands to the store: the choices, the name and the folder the person picked. */
export interface NewProjectRequest extends NewProjectChoices { name: string; handle: FileSystemDirectoryHandle }

/** The simulation, then every board of the manifest. */
export function newProjectTargets(): { value: string; label: string }[] {
  return [
    { value: SIMULATION_TARGET, label: 'Simulation' },
    ...BOARD_OPTIONS.filter((entry) => entry.value !== '' && entry.value !== 'custom'),
  ];
}

export type ProjectNameProblem = 'empty' | 'long' | 'invalid';

export function validateProjectName(name: string): ProjectNameProblem | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.length > PROJECT_NAME_MAX) return 'long';
  // eslint-disable-next-line no-control-regex
  return /[\\/\u0000-\u001f\u007f]/.test(trimmed) ? 'invalid' : null;
}

/** The first program: `main` in the chosen language, and the text it starts with. */
export function newProjectProgram(projectName: string, language: PLCLanguage): { fileName: string; content: string } {
  const fileName = `main${getExtensionForLanguage(language)}`;
  if (language !== 'ST') return { fileName, content: createEmptyFileContent(language) };
  return { fileName, content: `(* =============================================================================
 * ${projectName} - Main Program
 * ============================================================================= *)

PROGRAM Main
VAR
    (* Declare your variables here *)
    Counter : INT := 0;
END_VAR

(* Main program logic *)
Counter := Counter + 1;

IF Counter > 1000 THEN
    Counter := 0;
END_IF;

END_PROGRAM
` };
}

export function newProjectConfig(name: string, choices: NewProjectChoices): ZPLCProjectV2 {
  const { fileName } = newProjectProgram(name, choices.language);
  const [main, ...others] = DEFAULT_ZPLC_CONFIG.tasks;
  return {
    ...DEFAULT_ZPLC_CONFIG,
    name,
    ...(choices.target === SIMULATION_TARGET ? {} : { target: { board: choices.target } }),
    // a task names main.ld.json as main.ld (listTaskPrograms)
    tasks: main ? [{ ...main, programs: [fileName.replace(/(\.(?:ld|fbd|sfc))\.json$/i, '$1')] }, ...others] : DEFAULT_ZPLC_CONFIG.tasks,
  };
}
