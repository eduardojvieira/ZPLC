/** The text of one surface, in English and in Spanish (UX-029, UX-030). Keys `interlock.*`. */
export const interlockEn = {
  // InterlockCoverage.tsx
  'interlock.safetyDiagnostics': 'Safety diagnostics',
  'interlock.noIncompatibleOutputsAre': 'No incompatible outputs are declared in this project.',
  'interlock.declaredInterlockCoverageResul': 'Declared interlock coverage result was invalid.',
  'interlock.declaredOutputInterlockCoverag': 'Declared output interlock coverage.',
  'interlock.outputA': 'Output A',
  'interlock.outputB': 'Output B',
  'interlock.status': 'Status',
  'interlock.missingExactNeverCoverage': 'Missing exact NEVER coverage',
  'interlock.covered': 'Covered',
  'interlock.declaredInterlockCoverage': 'Declared interlock coverage',
  'interlock.checking': 'Checking…',
  'interlock.checkDeclaredInterlocks': 'Check declared interlocks',
  'interlock.saveTheProjectAnd': 'Save the project and choose zplc.json in Tests to check declared interlocks.',
  'interlock.saveAllChangesBefore': 'Save all changes before checking declared interlocks.',
  'interlock.declaredInterlockCoverageRequi': 'Declared interlock coverage requires the desktop app.',
  'interlock.openASavedProject': 'Open a saved project folder to check declared interlocks.',
  'interlock.declaredInterlockCoverageIs': 'Declared interlock coverage is unavailable.',
  'interlock.checksExactNeverCoverage':
    'Checks exact NEVER coverage in saved scenarios. It does not establish physical safety, timing, or certification.',
} as const;

export const interlockEs: Record<keyof typeof interlockEn, string> = {
  // InterlockCoverage.tsx
  'interlock.safetyDiagnostics': 'Diagnósticos de seguridad',
  'interlock.noIncompatibleOutputsAre': 'No se declara ninguna salida incompatible en este proyecto.',
  'interlock.declaredInterlockCoverageResul': 'El resultado de la cobertura de enclavamientos declarados no era válido.',
  'interlock.declaredOutputInterlockCoverag': 'Cobertura de los enclavamientos de salida declarados.',
  'interlock.outputA': 'Salida A',
  'interlock.outputB': 'Salida B',
  'interlock.status': 'Estado',
  'interlock.missingExactNeverCoverage': 'Falta la cobertura exacta de NEVER',
  'interlock.covered': 'Cubierto',
  'interlock.declaredInterlockCoverage': 'Cobertura de enclavamientos declarados',
  'interlock.checking': 'Comprobando…',
  'interlock.checkDeclaredInterlocks': 'Comprobar los enclavamientos declarados',
  'interlock.saveTheProjectAnd': 'Guarde el proyecto y elija zplc.json en “Pruebas” para comprobar los enclavamientos declarados.',
  'interlock.saveAllChangesBefore': 'Guarde todos los cambios antes de comprobar los enclavamientos declarados.',
  'interlock.declaredInterlockCoverageRequi': 'La cobertura de enclavamientos declarados requiere la aplicación de escritorio.',
  'interlock.openASavedProject': 'Abra una carpeta de proyecto guardada para comprobar los enclavamientos declarados.',
  'interlock.declaredInterlockCoverageIs': 'La cobertura de enclavamientos declarados no está disponible.',
  'interlock.checksExactNeverCoverage':
    'Comprueba la cobertura exacta de NEVER en los escenarios guardados. No establece seguridad física, temporización ni certificación.',
};
