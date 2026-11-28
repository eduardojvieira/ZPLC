import { LESSON_INDEX } from '../generated/lessonIndex';

/**
 * A lesson that talks to the Modbus TCP server or the MQTT broker that the simulation starts says so in its hardware reason
 * (lesson.json `unsupported.hardware`). A Windows runtime is built without the host communication sources
 * (firmware/lib/zplc_core/CMakeLists.txt, `if(NOT WIN32)`), so such a lesson cannot run there: a known limit of 2.1.0.
 * ponytail: read from the prose of the reason; a `needsComm` manifest field is the upgrade when a lesson needs comm without it.
 */
export function lessonNeedsComm(lessonId: string): boolean {
  const reason = LESSON_INDEX.lessons.find((lesson) => lesson.id === lessonId)?.unsupported.hardware?.reason.en ?? '';
  return /Modbus|MQTT/.test(reason);
}
