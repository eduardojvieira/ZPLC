/** The text of the Studio notices (W8) of spec 013, in English and in Spanish. Keys `studio.notice.*`. Registered empty by task W0; the task named fills it. */
import { PRODUCT_NAME } from '../../productName';

/** The notice of a file replaced from outside (AIX-012), with what changed and the restore of what Studio had. */
export const studioNoticesEn = {
  'studio.notice.externalRegion': `Changes made outside ${PRODUCT_NAME}`,
  'studio.notice.externalUpdated': `Updated outside ${PRODUCT_NAME}: {name}`,
  'studio.notice.externalPlant': 'Plant updated from disk: {name}',
  'studio.notice.externalProject': 'Project settings updated from disk: {name}',
  'studio.notice.whatChanged': 'What changed',
  'studio.notice.whatChangedLabel': 'What changed in {name}',
  'studio.notice.restore': 'Restore',
  'studio.notice.restoreLabel': `Restore the version of {name} that ${PRODUCT_NAME} had`,
  'studio.notice.dismissLabel': 'Dismiss the notice about {name}',
  'studio.notice.reviewTitle': 'What changed in {name}',
  'studio.notice.reviewIntro': `Lines marked - are the version ${PRODUCT_NAME} had; lines marked + are on disk now.`,
  'studio.notice.compare': 'Compare',
  'studio.notice.compareLabel': 'Compare your version of {name} with the one on disk',
  'studio.notice.compareIntro': 'Lines marked - are your version; lines marked + are on disk.',
  'studio.notice.noDifference': 'No line differs.',
  'studio.notice.closeReview': 'Close',
  'studio.notice.restored': 'Restored {name}.',
  'studio.notice.restoreFailed': 'Could not restore {name}: {reason}',
  'studio.notice.restoreStale': `Did not restore {name}: it changed again since this notice, and ${PRODUCT_NAME} writes nothing over it.`,
} as const;

export const studioNoticesEs: Record<keyof typeof studioNoticesEn, string> = {
  'studio.notice.externalRegion': `Cambios hechos fuera de ${PRODUCT_NAME}`,
  'studio.notice.externalUpdated': `Actualizado fuera de ${PRODUCT_NAME}: {name}`,
  'studio.notice.externalPlant': 'Planta actualizada desde el disco: {name}',
  'studio.notice.externalProject': 'Configuración del proyecto actualizada desde el disco: {name}',
  'studio.notice.whatChanged': 'Qué cambió',
  'studio.notice.whatChangedLabel': 'Qué cambió en {name}',
  'studio.notice.restore': 'Restaurar',
  'studio.notice.restoreLabel': `Restaurar la versión de {name} que tenía ${PRODUCT_NAME}`,
  'studio.notice.dismissLabel': 'Descartar el aviso sobre {name}',
  'studio.notice.reviewTitle': 'Qué cambió en {name}',
  'studio.notice.reviewIntro': `Las líneas marcadas con - son la versión que tenía ${PRODUCT_NAME}; las marcadas con + están ahora en el disco.`,
  'studio.notice.compare': 'Comparar',
  'studio.notice.compareLabel': 'Comparar su versión de {name} con la del disco',
  'studio.notice.compareIntro': 'Las líneas marcadas con - son su versión; las marcadas con + están en el disco.',
  'studio.notice.noDifference': 'Ninguna línea difiere.',
  'studio.notice.closeReview': 'Cerrar',
  'studio.notice.restored': 'Se restauró {name}.',
  'studio.notice.restoreFailed': 'No se pudo restaurar {name}: {reason}',
  'studio.notice.restoreStale': `No se restauró {name}: cambió de nuevo desde este aviso, y ${PRODUCT_NAME} no escribe nada encima.`,
};
