/** The text of the hardware track of Learn (LRN-013, LRN-024), in English and in Spanish. Keys `learn.hardware.*`. */
export const learnHardwareEn = {
  'learn.hardware.title': 'Hardware track',
  'learn.hardware.intro': 'Run the lessons on your own board. Connecting, deploying and running stay your actions: Learn never starts them.',
  'learn.hardware.board': 'Your board',
  'learn.hardware.board.pico': 'Raspberry Pi Pico',
  'learn.hardware.board.esp32s3': 'ESP32-S3-DevKitC-1',
  'learn.hardware.board.none': 'No board chosen yet.',
  'learn.hardware.board.chosen': 'Board for the hardware track: {board}',
  'learn.hardware.passedList': 'Passed on hardware: {lessons}',
  'learn.hardware.passedNone': 'No lesson has been passed on hardware yet.',
  'learn.hardware.lesson.passed': 'Passed on hardware',
  'learn.hardware.lesson.notPassed': 'Not passed on hardware',
} as const;

export const learnHardwareEs: Record<keyof typeof learnHardwareEn, string> = {
  'learn.hardware.title': 'Pista de hardware',
  'learn.hardware.intro': 'Ejecute las lecciones en su propia placa. Conectar, cargar y ejecutar siguen siendo acciones suyas: Learn nunca las inicia.',
  'learn.hardware.board': 'Su placa',
  'learn.hardware.board.pico': 'Raspberry Pi Pico',
  'learn.hardware.board.esp32s3': 'ESP32-S3-DevKitC-1',
  'learn.hardware.board.none': 'Aún no ha elegido una placa.',
  'learn.hardware.board.chosen': 'Placa de la pista de hardware: {board}',
  'learn.hardware.passedList': 'Aprobadas en hardware: {lessons}',
  'learn.hardware.passedNone': 'Todavía no se aprobó ninguna lección en hardware.',
  'learn.hardware.lesson.passed': 'Aprobada en hardware',
  'learn.hardware.lesson.notPassed': 'Sin aprobar en hardware',
};
