/** Text of milestone U3 of spec 013 for the Guide (plan-u3.md, Task X1a declares the file; the lane that owns it fills it). */
export const u3GuideEn = {
  'command.view.guide': 'Show the guide',
  'command.learn.guide.next': 'Next step of the lesson',
  'command.learn.guide.back': 'Previous step of the lesson',
  'command.learn.check': 'Check the lesson',
} as const;
export const u3GuideEs: Record<keyof typeof u3GuideEn, string> = {
  'command.view.guide': 'Mostrar la guía',
  'command.learn.guide.next': 'Siguiente paso de la lección',
  'command.learn.guide.back': 'Paso anterior de la lección',
  'command.learn.check': 'Comprobar la lección',
};
