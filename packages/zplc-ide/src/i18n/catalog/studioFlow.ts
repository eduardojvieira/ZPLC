/** The text of the Studio flow (W5, W6) of spec 013, in English and in Spanish. Keys `studio.flow.*`. W5 adds the save preference. */
export const studioFlowEn = {
  'studio.flow.saveBeforeRun': 'Before running and building',
  'studio.flow.saveBeforeRun.always': 'Save the project first',
  'studio.flow.saveBeforeRun.ask': 'Ask before saving',
} as const;
export const studioFlowEs: Record<keyof typeof studioFlowEn, string> = {
  'studio.flow.saveBeforeRun': 'Antes de ejecutar y compilar',
  'studio.flow.saveBeforeRun.always': 'Guardar el proyecto primero',
  'studio.flow.saveBeforeRun.ask': 'Preguntar antes de guardar',
};
