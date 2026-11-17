/** Text of milestone U2 of spec 013 for the change review document (SHL-004, IDE-030). */
export const u2ReviewEn = {
  'review.title': 'Changes',
  'review.empty': 'No pending changes.',
  'review.emptyHint': 'Edit a program without saving it, then review the change here before it is saved.',
  'review.proposed': 'A change is proposed and waits for your review.',
  'review.open': 'Review',
  'review.close': 'Close the changes',
} as const;
export const u2ReviewEs: Record<keyof typeof u2ReviewEn, string> = {
  'review.title': 'Cambios',
  'review.empty': 'No hay cambios pendientes.',
  'review.emptyHint': 'Edite un programa sin guardarlo y revise aquí el cambio antes de guardarlo.',
  'review.proposed': 'Hay un cambio propuesto que espera su revisión.',
  'review.open': 'Revisar',
  'review.close': 'Cerrar los cambios',
};
