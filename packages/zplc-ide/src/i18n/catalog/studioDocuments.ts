/** The text of the Studio documents (W2, W3) of spec 013, in English and in Spanish. Keys `studio.document.*`. Registered empty by task W0; W2 fills the editor groups and W3 the plant. */
export const studioDocumentsEn = {
  'studio.document.group.first': 'Left editor group',
  'studio.document.group.second': 'Right editor group',
  'studio.document.actions': 'Editor group actions',
  'studio.document.separator': 'Resize the editor groups',
  'studio.document.splitRight': 'Split to the right',
  'studio.document.moveToOther': 'Move to the other group',
  'studio.document.maximise': 'Maximise the document',
  'studio.document.maximised': 'The document is maximised. Use the same command again to restore the layout.',
  'studio.plant.views': 'Plant view',
  'studio.plant.close': 'Close the plant',
  'studio.plant.live': 'Live',
  'studio.plant.replay': 'Replay',
  'studio.plant.empty': 'There is no plant to show yet. Open a plant lesson, or run the project tests to record a replay.',
  'studio.plant.showTests': 'Show the tests',
} as const;
export const studioDocumentsEs: Record<keyof typeof studioDocumentsEn, string> = {
  'studio.document.group.first': 'Grupo de editor izquierdo',
  'studio.document.group.second': 'Grupo de editor derecho',
  'studio.document.actions': 'Acciones del grupo de editor',
  'studio.document.separator': 'Cambiar el tamaño de los grupos del editor',
  'studio.document.splitRight': 'Dividir a la derecha',
  'studio.document.moveToOther': 'Mover al otro grupo',
  'studio.document.maximise': 'Maximizar el documento',
  'studio.document.maximised': 'El documento está maximizado. Usa el mismo comando otra vez para restaurar el diseño.',
  'studio.plant.views': 'Vista de la planta',
  'studio.plant.close': 'Cerrar la planta',
  'studio.plant.live': 'En vivo',
  'studio.plant.replay': 'Repetición',
  'studio.plant.empty':
    'Todavía no hay una planta para mostrar. Abre una lección con planta, o ejecuta las pruebas del proyecto para grabar una repetición.',
  'studio.plant.showTests': 'Mostrar las pruebas',
};
