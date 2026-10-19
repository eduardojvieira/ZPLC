/** The text of the visual editors' gestures and online cues, in English and in Spanish (UX-009, UX-033). Keys `editor.*`. */
export const editorGesturesEn = {
  'editor.readFault': 'The variable could not be read from the runtime',
} as const;

export const editorGesturesEs: Record<keyof typeof editorGesturesEn, string> = {
  'editor.readFault': 'La variable no se pudo leer desde el entorno de ejecución',
};
