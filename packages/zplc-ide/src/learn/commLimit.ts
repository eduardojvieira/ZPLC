/**
 * The lessons that talk to the Modbus TCP server or the MQTT broker that the simulation starts. A Windows runtime is built without
 * the host communication sources (firmware/lib/zplc_core/CMakeLists.txt, `if(NOT WIN32)`), so these lessons cannot run there:
 * a known limit of 2.1.0. Guarded by commLimit.test.ts against a new lesson that names Modbus or MQTT in its hardware reason.
 */
const COMM_LESSONS: ReadonlySet<string> = new Set(['modbus-coil-fbd', 'modbus-register-round-trip', 'mqtt-publish-subscribe']);

export function lessonNeedsComm(lessonId: string): boolean {
  return COMM_LESSONS.has(lessonId);
}
