/** The text of the Studio surfaces (W1) of spec 013, in English and in Spanish. Keys `studio.surface.*`. */
export const studioSurfacesEn = {
  'studio.surface.plant': 'Plant',
  'studio.surface.settings': 'Settings',
  'studio.surface.learn': 'Learn home',
  'studio.surface.palette': 'Command palette',
  'studio.surface.shortcuts': 'Keyboard shortcuts',
} as const;
export const studioSurfacesEs: Record<keyof typeof studioSurfacesEn, string> = {
  'studio.surface.plant': 'Planta',
  'studio.surface.settings': 'Ajustes',
  'studio.surface.learn': 'Inicio del curso',
  'studio.surface.palette': 'Paleta de comandos',
  'studio.surface.shortcuts': 'Atajos de teclado',
};
