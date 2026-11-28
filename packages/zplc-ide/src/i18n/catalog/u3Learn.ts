/**
 * Text of milestone U3 of spec 013 for the Learn activity and its home (plan-u3.md, Task X1a declares the file; the lane that owns it
 * fills it).
 */
export const u3LearnEn = {
  'command.view.focusCommandBar': 'Go to the command bar',
  'learn.home.skipToSwitches': 'Skip to the switches',
  'u3Learn.outline.title': 'Course outline',
  'u3Learn.outline.filterLabel': 'Filter lessons by title or id',
  'u3Learn.outline.filterEmpty': 'No lesson matches {query}.',
  'u3Learn.outline.current': 'Current lesson',
  'u3Learn.outline.lockedBy': 'Unlocks when you pass {lessons}.',
  'u3Learn.outline.lockedByPath': 'Unlocks when you pass the lesson before it in the path: {lessons}.',
} as const;
export const u3LearnEs: Record<keyof typeof u3LearnEn, string> = {
  'command.view.focusCommandBar': 'Ir a la barra de comandos',
  'learn.home.skipToSwitches': 'Ir a los interruptores',
  'u3Learn.outline.title': 'Índice del curso',
  'u3Learn.outline.filterLabel': 'Filtrar lecciones por título o id',
  'u3Learn.outline.filterEmpty': 'Ninguna lección coincide con {query}.',
  'u3Learn.outline.current': 'Lección actual',
  'u3Learn.outline.lockedBy': 'Se desbloquea al aprobar {lessons}.',
  'u3Learn.outline.lockedByPath': 'Se desbloquea al aprobar la lección anterior de la ruta: {lessons}.',
};
