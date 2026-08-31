import type { WorkspaceTestPresentation } from './workspaceTestPresentation';

export type LearnLocale = 'es' | 'en';
export type LearnLessonId = 'motor-start-stop-safe' | 'pedestrian-crossing-states' | 'tank-level-fault-reset' | 'conveyor-classification-jam' | 'blinky-ladder-timer-feedback' | 'motor-plant-feedback' | 'edge-counter-pulses' | 'scan-cycle-one-scan-memory' | 'temporal-assertions-jam-fault' | 'conveyor-two-parts-diagnosis';
const canonicalLessonIds: readonly LearnLessonId[] = ['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-classification-jam', 'blinky-ladder-timer-feedback', 'motor-plant-feedback', 'edge-counter-pulses', 'scan-cycle-one-scan-memory', 'temporal-assertions-jam-fault', 'conveyor-two-parts-diagnosis'];
export const LEARN_MASTERY_STORAGE_KEY = 'zplc:learn-mastery:v1';
const LEARN_MASTERY_MAX_BYTES = 4096;

export type LearnStage = { title: string; body: string; checkpoint: string };

export type LearnLesson = {
  id: LearnLessonId;
  exampleId: 'motor_start_stop' | 'pedestrian_crossing' | 'tank_level' | 'conveyor_01' | 'blinky' | 'motor_plant' | 'edge_counter' | 'scan_snapshot';
  requiredScenario: 'MotorStartStop' | 'PedestrianCrossing' | 'TankLevel' | 'Conveyor01' | 'ConveyorTwoParts' | 'BlinkyVisual' | 'MotorPlant' | 'EdgeCounter' | 'ScanSnapshot';
  sourcePath: 'src/Motor.st' | 'src/PedestrianCrossing.st' | 'src/TankLevel.st' | 'src/Conveyor.st' | 'src/main.ld' | 'src/MotorPlant.st' | 'src/EdgeCounter.st' | 'src/ScanSnapshot.st';
  scenarioPath: 'tests/motor-start-stop.scenario.json' | 'tests/pedestrian-crossing.scenario.json' | 'tests/tank-level.scenario.json' | 'tests/conveyor-01.scenario.json' | 'tests/conveyor-two-parts.scenario.json' | 'tests/blinky-visual.scenario.json' | 'tests/motor-plant.scenario.json' | 'tests/edge-counter.scenario.json' | 'tests/scan-snapshot.scenario.json';
  title: string;
  summary: string;
  stages: readonly LearnStage[];
  scope: string;
};

export type LearnLessonGrade =
  | { kind: 'not-run' | 'unavailable' | 'unrelated' }
  | { kind: 'passed' | 'failed'; assertions: number };

const sha256 = /^[a-f0-9]{64}$/;
const savedInputFileCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 3 && value <= 193;

export type LearnMasteryStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function emptyMastery(): Set<LearnLessonId> { return new Set(); }

function isPlainDataObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const actual = Object.getOwnPropertyNames(value);
    if (actual.length !== keys.length || !keys.every((key) => actual.includes(key))) return false;
    return keys.every((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable); });
  } catch { return false; }
}

function isDenseStringArray(value: unknown): value is string[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) return false;
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || !names.includes('length')) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || !descriptor.enumerable) return false;
    }
    return true;
  } catch { return false; }
}

function browserMasteryStorage(): LearnMasteryStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

export function readLearnMastery(storage: LearnMasteryStorage | undefined = browserMasteryStorage()): Set<LearnLessonId> {
  try {
    const raw = storage?.getItem(LEARN_MASTERY_STORAGE_KEY);
    if (raw === null || typeof raw !== 'string' || raw.length > LEARN_MASTERY_MAX_BYTES || new TextEncoder().encode(raw).byteLength > LEARN_MASTERY_MAX_BYTES) return emptyMastery();
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainDataObject(parsed, ['schemaVersion', 'mastered']) || parsed.schemaVersion !== 1 || !isDenseStringArray(parsed.mastered)) return emptyMastery();
    const mastered = parsed.mastered as string[];
    let previousIndex = -1;
    if (mastered.some((id) => { const index = canonicalLessonIds.indexOf(id as LearnLessonId); const invalid = index < 0 || index <= previousIndex; previousIndex = index; return invalid; })) return emptyMastery();
    return new Set<LearnLessonId>(mastered as LearnLessonId[]);
  } catch { return emptyMastery(); }
}

export function recordLearnMastery(lessonId: LearnLessonId, grade: LearnLessonGrade, previous: ReadonlySet<LearnLessonId>, storage: LearnMasteryStorage | undefined = browserMasteryStorage()): ReadonlySet<LearnLessonId> {
  if (grade.kind !== 'passed' || previous.has(lessonId) || !storage) return previous;
  const mastered = canonicalLessonIds.filter((id) => previous.has(id) || id === lessonId);
  try {
    storage.setItem(LEARN_MASTERY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, mastered }));
    return new Set(mastered);
  } catch { return previous; }
}

/** Grades only complete, recorded host scenario evidence for the selected lesson. */
export function gradeRecordedScenarioLesson(lesson: LearnLesson, presentation: WorkspaceTestPresentation | undefined): LearnLessonGrade {
  if (!presentation) return { kind: 'not-run' };
  if (presentation.operation !== 'scenario-run') return presentation.operation ? { kind: 'unrelated' } : { kind: 'unavailable' };
  if (!presentation.hasEvidence || presentation.scenarioCount !== 1 || !presentation.preview || !presentation.savedTestInputIdentity) return { kind: 'unavailable' };

  const { preview, savedTestInputIdentity } = presentation;
  if (preview.totalScenarioCount !== 1 || preview.scenarios.length !== 1) return { kind: 'unavailable' };
  const scenario = preview.scenarios[0];
  if (!scenario || scenario.id !== lesson.requiredScenario || scenario.path !== lesson.scenarioPath) return { kind: 'unrelated' };
  if (scenario.truncated || scenario.totalAssertions !== scenario.assertions.length || scenario.totalAssertions < 1 || scenario.totalSamples !== scenario.samples.length || scenario.totalSamples < 1
    || savedTestInputIdentity.schemaVersion !== 1 || !sha256.test(savedTestInputIdentity.sha256) || !savedInputFileCount(savedTestInputIdentity.fileCount)
    || presentation.artifacts.length !== 2 || presentation.artifacts.filter((artifact) => artifact.kind === 'zplc').length !== 1 || presentation.artifacts.filter((artifact) => artifact.kind === 'trace').length !== 1
    || !presentation.artifacts.some((artifact) => artifact.kind === 'zplc' && sha256.test(artifact.sha256) && Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0)
    || !presentation.artifacts.some((artifact) => artifact.kind === 'trace' && artifact.sha256 === preview.traceEvidenceSha256 && sha256.test(artifact.sha256) && Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0)) return { kind: 'unavailable' };

  const assertionsPassed = scenario.passed && scenario.assertions.every((assertion) => assertion.passed);
  if (presentation.kind === 'passed') return presentation.diagnostics.length === 0 && assertionsPassed ? { kind: 'passed', assertions: scenario.assertions.length } : { kind: 'unavailable' };
  if (presentation.kind === 'assertion-failed') return presentation.diagnostics.some((diagnostic) => diagnostic.code === 'SCENARIO_ASSERTION_FAILED') && !assertionsPassed ? { kind: 'failed', assertions: scenario.assertions.length } : { kind: 'unavailable' };
  return { kind: 'unavailable' };
}

export const learnLessonCatalog: Record<LearnLocale, readonly LearnLesson[]> = {
  es: [
    {
      id: 'motor-start-stop-safe', exampleId: 'motor_start_stop', requiredScenario: 'MotorStartStop', sourcePath: 'src/Motor.st', scenarioPath: 'tests/motor-start-stop.scenario.json',
      title: 'Arranque y parada seguros', summary: 'Recorré un motor con enclavamiento, parada y sobrecarga usando el ejemplo Motor Start Stop.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá la lógica de marcha, parada y seal-in; verificá que Reverse permanece FALSE.', checkpoint: 'La fuente a revisar es src/Motor.st.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá el estado del motor en 20, 40, 90 y 140 ms.', checkpoint: 'Motor.Forward: ON a 20 ms y OFF a 40, 90 y 140 ms. Motor.Reverse permanece OFF.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/Motor.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario MotorStartStop.', checkpoint: 'El escenario requerido se llama MotorStartStop.' },
        { title: 'Observá', body: 'Compará la traza: EStop a 40 ms, sobrecarga a 90 ms y parada a 140 ms.', checkpoint: 'EStop, Overload y Stop fuerzan Motor.Forward OFF.' },
        { title: 'Reflexioná', body: 'La assertion exacta NEVER comprueba cobertura lógica de este escenario.', checkpoint: 'No demuestra seguridad física, temporización de hardware ni certificación.' },
      ],
      scope: 'La evidencia de Tests es del host nativo POSIX; no es evidencia de hardware ni HIL.',
    },
    {
      id: 'pedestrian-crossing-states', exampleId: 'pedestrian_crossing', requiredScenario: 'PedestrianCrossing', sourcePath: 'src/PedestrianCrossing.st', scenarioPath: 'tests/pedestrian-crossing.scenario.json',
      title: 'Cruce peatonal y estados seguros', summary: 'Recorré estados de cruce peatonal con salidas de vehículo y peatón mutuamente consistentes.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá los estados que coordinan vehículos y peatones en src/PedestrianCrossing.st.', checkpoint: 'Cada estado debe dejar una combinación de salidas explícita.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá la secuencia de luces y señal peatonal.', checkpoint: 'verde+STOP 0 ms; amarillo+STOP 20; rojo+STOP 40; rojo+WALK 60; rojo+STOP 90; verde+STOP 110.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/PedestrianCrossing.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario PedestrianCrossing.', checkpoint: 'El escenario requerido se llama PedestrianCrossing.' },
        { title: 'Observá', body: 'Revisá la matriz registrada en Tests y compará cada muestra con la predicción.', checkpoint: 'La traza muestra el cambio a WALK sólo durante el estado rojo.' },
        { title: 'Reflexioná', body: 'La assertion NEVER cubre salidas incompatibles lógicas sólo en este escenario.', checkpoint: 'No demuestra un cruce físico, temporización de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de cruce físico, hardware, HIL ni certificación.',
    },
    {
      id: 'tank-level-fault-reset', exampleId: 'tank_level', requiredScenario: 'TankLevel', sourcePath: 'src/TankLevel.st', scenarioPath: 'tests/tank-level.scenario.json',
      title: 'Nivel de tanque, fallas y reset', summary: 'Recorré el control de nivel y los enclavamientos de falla y reset del ejemplo Tank Level.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá PumpLatched, FaultLatched y ResetArmed en src/TankLevel.st.', checkpoint: 'Las memorias de bomba, falla y reset deben tener estados explícitos.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá la bomba y alarma durante los cambios de nivel y falla.', checkpoint: 'Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/TankLevel.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario TankLevel.', checkpoint: 'El escenario requerido se llama TankLevel.' },
        { title: 'Observá', body: 'Relacioná 80/100/120/140 ms con fault, reset, EStop y la recuperación; nunca deben coexistir Pump+Alarm.', checkpoint: 'La matriz registrada en Tests muestra cada transición de bomba y alarma.' },
        { title: 'Reflexioná', body: 'La assertion NEVER cubre Pump+Alarm sólo en este escenario registrado.', checkpoint: 'No demuestra un proceso físico, temporización de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de proceso físico, hardware, HIL ni certificación.',
    },
    {
      id: 'conveyor-classification-jam', exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json',
      title: 'Cinta de clasificación y atasco seguro', summary: 'Recorré la clasificación de piezas y el bloqueo seguro por atasco del ejemplo Conveyor 01.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá Requested, Faulted y MetalLatched; los sensores pertenecen a la plant.', checkpoint: 'La lógica sólo manda salidas a partir de sensores registrados por la plant.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá la cinta, desviador y lámpara de falla.', checkpoint: 'Belt ON 10–40; Diverter ON sólo 30; FaultLamp ON y Belt OFF 50–80. Reset a 60 no libera mientras JamDetected sigue activo.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/Conveyor.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente Conveyor01; no ejecutes Tests-all porque incluye ConveyorTwoParts.', checkpoint: 'El escenario requerido se llama Conveyor01.' },
        { title: 'Observá', body: 'Revisá la matriz: classifier+metal 20, diverter+count=1 a 30, jam 50.', checkpoint: 'El atasco enciende FaultLamp y detiene Belt.' },
        { title: 'Reflexioná', body: 'La assertion NEVER cubre DiverterCommand ON con BeltCommand OFF sólo en este escenario.', checkpoint: 'No demuestra cinta física, despeje de atasco, temporización de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de cinta física, despeje de atasco, hardware, HIL ni certificación.',
    },
    {
      id: 'blinky-ladder-timer-feedback', exampleId: 'blinky', requiredScenario: 'BlinkyVisual', sourcePath: 'src/main.ld', scenarioPath: 'tests/blinky-visual.scenario.json',
      title: 'Ladder, TON y realimentación de salida', summary: 'Recorré el contacto NC, TON y realimentación de salida del ejemplo Ladder de Blinky.',
      stages: [
        { title: 'Objetivo', body: 'Identificá el contacto NC LED_Output, TON BlinkTimer con T#500ms y la coil en src/main.ld.', checkpoint: 'La salida se realimenta para habilitar el temporizador cuando LED está OFF.' },
        { title: 'Predecí', body: 'Antes de ejecutar, seguí la realimentación entre temporizador y coil.', checkpoint: 'LED OFF habilita TON; BlinkTimer.Q alimenta coil; el escenario exige FALLING entre 10–550 ms y RISING entre 10–1090 ms.' },
        { title: 'Editá', body: 'Agregá sólo un comentario explicativo inocuo a un rung en src/main.ld. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente BlinkyVisual.', checkpoint: 'El escenario requerido se llama BlinkyVisual.' },
        { title: 'Observá', body: 'Revisá trace y tabla: aparecen true y false, y pasan ambos flancos.', checkpoint: 'La evidencia registrada contiene FALLING y RISING.' },
        { title: 'Reflexioná', body: 'Las assertions cubren programa visual y escenario host, no período ni duty eléctrico.', checkpoint: 'No demuestra LED físico, timing de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es del host nativo POSIX; no es evidencia de LED físico, timing de hardware, HIL ni certificación.',
    },
    {
      id: 'motor-plant-feedback', exampleId: 'motor_plant', requiredScenario: 'MotorPlant', sourcePath: 'src/MotorPlant.st', scenarioPath: 'tests/motor-plant.scenario.json',
      title: 'Comando, realimentación y velocidad', summary: 'Separá la orden del motor de la confirmación de marcha usando la planta Motor Plant.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá Requested, Command y Running en src/MotorPlant.st.', checkpoint: 'Command expresa la orden; Running depende además de AtSpeed.' },
        { title: 'Predecí', body: 'Antes de ejecutar, diferenciá la orden de la confirmación.', checkpoint: '0 ms: Command/Running OFF; 10: Command ON y Running OFF; 30: ambos ON; 40: ambos OFF.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/MotorPlant.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario MotorPlant.', checkpoint: 'El escenario requerido se llama MotorPlant.' },
        { title: 'Observá', body: 'Compará 10 con 30 ms: la planta registra orden antes de AtSpeed; Stop a 40 apaga ambos.', checkpoint: 'La matriz y la traza registradas muestran el avance discreto de speed/AtSpeed.' },
        { title: 'Reflexioná', body: 'RISING/FALLING cubren esta transición y NEVER comprueba que Running no aparezca sin Command dentro de este escenario.', checkpoint: 'No demuestra inercia, motor físico, timing de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es determinística del host nativo POSIX y de la planta discreta; no es evidencia de motor físico, hardware, HIL ni certificación.',
    },
    {
      id: 'edge-counter-pulses', exampleId: 'edge_counter', requiredScenario: 'EdgeCounter', sourcePath: 'src/EdgeCounter.st', scenarioPath: 'tests/edge-counter.scenario.json',
      title: 'Flancos y contador de pulsos', summary: 'Usá R_TRIG y CTU para contar tres pulsos discretos y resetear el umbral.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá PulseInput, Reset, Edge, Count y CountReached en src/EdgeCounter.st.', checkpoint: 'R_TRIG convierte cada flanco ascendente en un pulso de un scan; CTU cuenta esos pulsos.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá cuándo el contador alcanza PV=3.', checkpoint: 'CountReached permanece OFF a 0, 10 y 30 ms; enciende a 50 tras el tercer flanco; vuelve OFF a 70 con Reset.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/EdgeCounter.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario EdgeCounter.', checkpoint: 'El escenario requerido se llama EdgeCounter.' },
        { title: 'Observá', body: 'Compará los eventos de 10, 30, 50 y 70 ms con la salida CountReached.', checkpoint: 'El tercer pulso alcanza PV=3; Reset domina y devuelve CountReached a OFF.' },
        { title: 'Reflexioná', body: 'Las assertions AT/RISING/FALLING cubren esta secuencia lógica discreta.', checkpoint: 'No demuestran rebote, pulsos eléctricos, timing de hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es del host nativo POSIX; no es evidencia de sensor físico, rebote, hardware, HIL ni certificación.',
    },
    {
      id: 'scan-cycle-one-scan-memory', exampleId: 'scan_snapshot', requiredScenario: 'ScanSnapshot', sourcePath: 'src/ScanSnapshot.st', scenarioPath: 'tests/scan-snapshot.scenario.json',
      title: 'Ciclo de scan y memoria de un ciclo', summary: 'Seguí cómo una entrada produce una salida actual y una copia demorada un scan.',
      stages: [
        { title: 'Objetivo', body: 'Ubicá Button, Previous, Current, Delayed y RisingPulse en src/ScanSnapshot.st.', checkpoint: 'Previous se actualiza al final del scan.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá los cuatro samples registrados.', checkpoint: '000@0, 101@10, 010@20, 000@30.' },
        { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/ScanSnapshot.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario ScanSnapshot.', checkpoint: 'El escenario requerido se llama ScanSnapshot.' },
        { title: 'Observá', body: 'Compará 10, 20 y 30 ms: RisingPulse dura un scan y Delayed conserva la copia demorada.', checkpoint: 'El pulso aparece a 10 ms; Delayed aparece a 20 ms y vuelve OFF a 30 ms.' },
        { title: 'Evidencia', body: 'AT/RISING/FALLING/NEVER cubren el escenario; los hashes y la traza pertenecen al host.', checkpoint: 'La evidencia registrada es del escenario host ejecutado.' },
        { title: 'Reflexioná', body: 'Actualizar Previous antes rompería el detector de flanco.', checkpoint: 'La memoria debe conservar el valor anterior hasta el final del scan.' },
      ],
      scope: 'La evidencia de Tests es del runtime nativo POSIX host con una única tarea de 10 ms; no demuestra timing de target, snapshot bajo interrupciones físicas, rebote eléctrico, HIL ni certificación.',
    },
    {
      id: 'temporal-assertions-jam-fault', exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json',
      title: 'Assertions temporales y falla por atasco', summary: 'Leé los contratos temporales del escenario Conveyor01 y contrastalos con la planta registrada.',
      stages: [
        { title: 'Objetivo', body: 'Usá src/Conveyor.st y tests/conveyor-01.scenario.json para separar la lógica de sus contratos temporales.', checkpoint: 'Esta lección interpreta tests; no requiere editar el programa.' },
        { title: 'Predecí', body: 'Antes de ejecutar, anticipá qué prueban las dos assertions AT.', checkpoint: 'AT exige BeltCommand, DiverterCommand y FaultLamp OFF a 0 ms y BeltCommand ON a 10 ms.' },
        { title: 'Leé el escenario', body: 'Leé RISING desde 20 ms dentro de 10 ms, NEVER con desviador activo y cinta apagada, WITHIN desde 50 ms con ventana 0 y FOR por 30 ms.', checkpoint: 'RISING alcanza DiverterCommand a más tardar a 30 ms; WITHIN exige Belt OFF y FaultLamp ON a 50 ms; FOR sostiene ese estado de 50 a 80 ms.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente Conveyor01.', checkpoint: 'El escenario requerido se llama Conveyor01 y contiene seis assertions.' },
        { title: 'Contrastá', body: 'Compará assertions, traza y planta registrada: la clasificación aparece antes del atasco; a 50 ms la cinta se apaga y la falla queda activa.', checkpoint: 'La planta registrada muestra la secuencia discreta, no una medición física.' },
        { title: 'Reflexioná', body: 'NEVER evita una combinación lógica incompatible dentro de este escenario; Reset a 60 ms no libera el fallo mientras el atasco inyectado sigue presente.', checkpoint: 'Un atasco inyectado no demuestra falla física, despeje físico, timing de target, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es del runtime nativo POSIX host y de la planta discreta; el atasco inyectado no es una falla física, despeje físico, timing de target, HIL ni certificación.',
    },
    {
      id: 'conveyor-two-parts-diagnosis', exampleId: 'conveyor_01', requiredScenario: 'ConveyorTwoParts', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-two-parts.scenario.json',
      title: 'Diagnóstico reproducible: dos piezas, una decisión', summary: 'Usá el calendario versionado para distinguir una pieza metálica de una no metálica sin inventar observabilidad.',
      stages: [
        { title: 'Ubicá', body: 'Ubicá PartAtClassifier, MetalDetected, PartAtDiverter y MetalLatched en src/Conveyor.st.', checkpoint: 'MetalLatched se activa con clasificador+metal y se limpia al llegar al desviador.' },
        { title: 'Predecí', body: 'La primera pieza es metálica y la segunda no metálica.', checkpoint: 'Esperá desvío sólo para la primera; Belt queda activo para ambas.' },
        { title: 'Leé el calendario', body: 'El JSON agenda clasificador→desviador 20→30 ms y 50→70 ms, con tick de 10 ms hasta 80 ms.', checkpoint: 'Las tres assertions son AT@30 Belt=true/Diverter=true, AT@70 Belt=true/Diverter=false y NEVER Diverter=true con Belt=false.' },
        { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente ConveyorTwoParts.', checkpoint: 'El escenario requerido se llama ConveyorTwoParts.' },
        { title: 'Diagnosticá', body: 'La matriz de Tests prueba outputs host: compará las muestras de 30 y 70 ms.', checkpoint: 'No prueba ni registra inputs, piezas físicas ni el estado interno MetalLatched.' },
        { title: 'Límites', body: 'Repetí el mismo escenario para una decisión reproducible sobre outputs del host.', checkpoint: 'No demuestra sensores o piezas físicas, timing de target, hardware, HIL ni certificación.' },
      ],
      scope: 'La evidencia de Tests es del runtime nativo POSIX host con inputs programados por escenario; no es evidencia de sensores ni piezas físicas, timing de target, hardware, HIL ni certificación.',
    },
  ],
  en: [
    {
      id: 'motor-start-stop-safe', exampleId: 'motor_start_stop', requiredScenario: 'MotorStartStop', sourcePath: 'src/Motor.st', scenarioPath: 'tests/motor-start-stop.scenario.json',
      title: 'Safe motor start-stop', summary: 'Walk through a motor with seal-in, stop, and overload handling using the Motor Start Stop example.',
      stages: [
        { title: 'Objective', body: 'Locate the start, stop, and seal-in logic; verify that Reverse remains FALSE.', checkpoint: 'The source to inspect is src/Motor.st.' },
        { title: 'Predict', body: 'Before running, predict the motor state at 20, 40, 90, and 140 ms.', checkpoint: 'Motor.Forward: ON at 20 ms and OFF at 40, 90, and 140 ms. Motor.Reverse remains OFF.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/Motor.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the MotorStartStop scenario.', checkpoint: 'The required scenario is named MotorStartStop.' },
        { title: 'Observe', body: 'Compare the trace: EStop at 40 ms, overload at 90 ms, and stop at 140 ms.', checkpoint: 'EStop, Overload, and Stop force Motor.Forward OFF.' },
        { title: 'Reflect', body: 'The exact NEVER assertion checks logical coverage for this scenario.', checkpoint: 'It does not establish physical safety, hardware timing, or certification.' },
      ],
      scope: 'Tests provide native POSIX host evidence only; they are not hardware or HIL evidence.',
    },
    {
      id: 'pedestrian-crossing-states', exampleId: 'pedestrian_crossing', requiredScenario: 'PedestrianCrossing', sourcePath: 'src/PedestrianCrossing.st', scenarioPath: 'tests/pedestrian-crossing.scenario.json',
      title: 'Pedestrian crossing and safe states', summary: 'Walk through pedestrian-crossing states with mutually consistent vehicle and pedestrian outputs.',
      stages: [
        { title: 'Objective', body: 'Locate the states coordinating vehicles and pedestrians in src/PedestrianCrossing.st.', checkpoint: 'Each state must leave an explicit output combination.' },
        { title: 'Predict', body: 'Before running, predict the light and pedestrian-signal sequence.', checkpoint: 'green+STOP 0 ms; yellow+STOP 20; red+STOP 40; red+WALK 60; red+STOP 90; green+STOP 110.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/PedestrianCrossing.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the PedestrianCrossing scenario.', checkpoint: 'The required scenario is named PedestrianCrossing.' },
        { title: 'Observe', body: 'Review the recorded matrix in Tests and compare every sample with the prediction.', checkpoint: 'The trace shows WALK only during the red state.' },
        { title: 'Reflect', body: 'The NEVER assertion covers logically incompatible outputs only in this scenario.', checkpoint: 'It does not establish a physical crossing, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical crossing, hardware, HIL, or certification evidence.',
    },
    {
      id: 'tank-level-fault-reset', exampleId: 'tank_level', requiredScenario: 'TankLevel', sourcePath: 'src/TankLevel.st', scenarioPath: 'tests/tank-level.scenario.json',
      title: 'Tank level, faults, and reset', summary: 'Walk through level control and the fault and reset latches in the Tank Level example.',
      stages: [
        { title: 'Objective', body: 'Locate PumpLatched, FaultLatched, and ResetArmed in src/TankLevel.st.', checkpoint: 'Pump, fault, and reset memory must have explicit states.' },
        { title: 'Predict', body: 'Before running, predict the pump and alarm through the level and fault changes.', checkpoint: 'Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/TankLevel.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the TankLevel scenario.', checkpoint: 'The required scenario is named TankLevel.' },
        { title: 'Observe', body: 'Relate 80/100/120/140 ms to fault, reset, EStop, and recovery; Pump+Alarm must never coexist.', checkpoint: 'The recorded matrix in Tests shows every pump and alarm transition.' },
        { title: 'Reflect', body: 'The NEVER assertion covers Pump+Alarm only in this recorded scenario.', checkpoint: 'It does not establish a physical process, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical-process, hardware, HIL, or certification evidence.',
    },
    {
      id: 'conveyor-classification-jam', exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json',
      title: 'Conveyor classification and safe jam', summary: 'Walk through part classification and the safe jam lockout in the Conveyor 01 example.',
      stages: [
        { title: 'Objective', body: 'Locate Requested, Faulted, and MetalLatched; sensors belong to the plant.', checkpoint: 'The logic commands outputs only from plant-recorded sensors.' },
        { title: 'Predict', body: 'Before running, predict the belt, diverter, and fault lamp.', checkpoint: 'Belt ON 10–40; Diverter ON only 30; FaultLamp ON and Belt OFF 50–80. Reset at 60 does not release while JamDetected remains active.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/Conveyor.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only Conveyor01; do not run Tests-all because it includes ConveyorTwoParts.', checkpoint: 'The required scenario is named Conveyor01.' },
        { title: 'Observe', body: 'Review the matrix: classifier+metal 20, diverter+count=1 at 30, jam 50.', checkpoint: 'The jam turns FaultLamp on and stops Belt.' },
        { title: 'Reflect', body: 'The NEVER assertion covers DiverterCommand ON with BeltCommand OFF only in this scenario.', checkpoint: 'It does not establish a physical conveyor, jam clearance, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical conveyor, jam clearance, hardware, HIL, or certification evidence.',
    },
    {
      id: 'blinky-ladder-timer-feedback', exampleId: 'blinky', requiredScenario: 'BlinkyVisual', sourcePath: 'src/main.ld', scenarioPath: 'tests/blinky-visual.scenario.json',
      title: 'Ladder, TON, and output feedback', summary: 'Walk through the NC contact, TON, and output feedback in the Blinky Ladder example.',
      stages: [
        { title: 'Objective', body: 'Identify the LED_Output NC contact, BlinkTimer TON with T#500ms, and the coil in src/main.ld.', checkpoint: 'Output feedback enables the timer while LED is OFF.' },
        { title: 'Predict', body: 'Before running, follow the feedback between timer and coil.', checkpoint: 'LED OFF enables TON; BlinkTimer.Q feeds the coil; scenario requires FALLING between 10–550 ms and RISING between 10–1090 ms.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment to a rung in src/main.ld. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only BlinkyVisual.', checkpoint: 'The required scenario is named BlinkyVisual.' },
        { title: 'Observe', body: 'Review trace and table: true and false appear, and both edges pass.', checkpoint: 'Recorded evidence contains FALLING and RISING.' },
        { title: 'Reflect', body: 'Assertions cover the visual program and host scenario, not electrical period or duty cycle.', checkpoint: 'It does not establish a physical LED, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide native POSIX host evidence only; they are not physical LED, hardware timing, HIL, or certification evidence.',
    },
    {
      id: 'motor-plant-feedback', exampleId: 'motor_plant', requiredScenario: 'MotorPlant', sourcePath: 'src/MotorPlant.st', scenarioPath: 'tests/motor-plant.scenario.json',
      title: 'Command, feedback, and speed', summary: 'Separate a motor command from the run confirmation using the Motor Plant.',
      stages: [
        { title: 'Objective', body: 'Locate Requested, Command, and Running in src/MotorPlant.st.', checkpoint: 'Command reflects the request; Running also depends on AtSpeed.' },
        { title: 'Predict', body: 'Before running, distinguish the command from the confirmation.', checkpoint: '0 ms: Command/Running OFF; 10: Command ON and Running OFF; 30: both ON; 40: both OFF.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/MotorPlant.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the MotorPlant scenario.', checkpoint: 'The required scenario is named MotorPlant.' },
        { title: 'Observe', body: 'Compare 10 with 30 ms: the plant records the command before AtSpeed; Stop at 40 turns both off.', checkpoint: 'The recorded matrix and trace show the discrete speed/AtSpeed advance.' },
        { title: 'Reflect', body: 'RISING/FALLING cover this transition, and NEVER checks that Running never appears without Command in this scenario.', checkpoint: 'It does not establish inertia, a physical motor, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide deterministic native POSIX host and discrete-plant evidence only; they are not physical-motor, hardware, HIL, or certification evidence.',
    },
    {
      id: 'edge-counter-pulses', exampleId: 'edge_counter', requiredScenario: 'EdgeCounter', sourcePath: 'src/EdgeCounter.st', scenarioPath: 'tests/edge-counter.scenario.json',
      title: 'Edges and pulse counter', summary: 'Use R_TRIG and CTU to count three discrete pulses and reset the threshold.',
      stages: [
        { title: 'Objective', body: 'Locate PulseInput, Reset, Edge, Count, and CountReached in src/EdgeCounter.st.', checkpoint: 'R_TRIG turns each rising edge into a one-scan pulse; CTU counts those pulses.' },
        { title: 'Predict', body: 'Before running, predict when the counter reaches PV=3.', checkpoint: 'CountReached stays OFF at 0, 10, and 30 ms; turns ON at 50 after the third edge; returns OFF at 70 with Reset.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/EdgeCounter.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the EdgeCounter scenario.', checkpoint: 'The required scenario is named EdgeCounter.' },
        { title: 'Observe', body: 'Compare 10, 30, 50, and 70 ms with CountReached.', checkpoint: 'The third pulse reaches PV=3; Reset dominates and returns CountReached to OFF.' },
        { title: 'Reflect', body: 'The AT/RISING/FALLING assertions cover this discrete logical sequence.', checkpoint: 'They do not establish bounce, electrical pulses, hardware timing, HIL, or certification.' },
      ],
      scope: 'Tests provide native POSIX host evidence only; they are not physical-sensor, bounce, hardware, HIL, or certification evidence.',
    },
    {
      id: 'scan-cycle-one-scan-memory', exampleId: 'scan_snapshot', requiredScenario: 'ScanSnapshot', sourcePath: 'src/ScanSnapshot.st', scenarioPath: 'tests/scan-snapshot.scenario.json',
      title: 'Scan cycle and one-scan memory', summary: 'Follow how one input produces the current output and a copy delayed by one scan.',
      stages: [
        { title: 'Objective', body: 'Locate Button, Previous, Current, Delayed, and RisingPulse in src/ScanSnapshot.st.', checkpoint: 'Previous updates at the end of the scan.' },
        { title: 'Predict', body: 'Before running, predict the four recorded samples.', checkpoint: '000@0, 101@10, 010@20, 000@30.' },
        { title: 'Edit', body: 'Add only a harmless explanatory comment in src/ScanSnapshot.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the ScanSnapshot scenario.', checkpoint: 'The required scenario is named ScanSnapshot.' },
        { title: 'Observe', body: 'Compare 10, 20, and 30 ms: RisingPulse lasts one scan and Delayed keeps the delayed copy.', checkpoint: 'The pulse appears at 10 ms; Delayed appears at 20 ms and returns OFF at 30 ms.' },
        { title: 'Evidence', body: 'AT/RISING/FALLING/NEVER cover the scenario; hashes and trace belong to the host.', checkpoint: 'Recorded evidence belongs to the executed host scenario.' },
        { title: 'Reflect', body: 'Updating Previous first would break the edge detector.', checkpoint: 'Memory must retain the prior value until the end of the scan.' },
      ],
      scope: 'Tests provide native POSIX host runtime evidence with one 10 ms task; they do not establish target timing, snapshots under physical interrupts, electrical bounce, HIL, or certification.',
    },
    {
      id: 'temporal-assertions-jam-fault', exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json',
      title: 'Temporal assertions and jam fault', summary: 'Read the Conveyor01 temporal contracts and compare them with the recorded plant.',
      stages: [
        { title: 'Objective', body: 'Use src/Conveyor.st and tests/conveyor-01.scenario.json to separate the logic from its temporal contracts.', checkpoint: 'This lesson interprets tests; it does not require editing the program.' },
        { title: 'Predict', body: 'Before running, predict what the two AT assertions prove.', checkpoint: 'AT requires BeltCommand, DiverterCommand, and FaultLamp OFF at 0 ms and BeltCommand ON at 10 ms.' },
        { title: 'Read the scenario', body: 'Read RISING from 20 ms within 10 ms, NEVER with the diverter active and belt off, WITHIN from 50 ms with a 0 ms window, and FOR for 30 ms.', checkpoint: 'RISING reaches DiverterCommand by 30 ms; WITHIN requires Belt OFF and FaultLamp ON at 50 ms; FOR holds that state from 50 to 80 ms.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only Conveyor01.', checkpoint: 'The required scenario is named Conveyor01 and contains six assertions.' },
        { title: 'Compare', body: 'Compare assertions, trace, and recorded plant: classification happens before the jam; at 50 ms the belt stops and the fault remains active.', checkpoint: 'The recorded plant shows the discrete sequence, not a physical measurement.' },
        { title: 'Reflect', body: 'NEVER prevents an incompatible logical combination within this scenario; Reset at 60 ms does not release the fault while the injected jam remains present.', checkpoint: 'An injected jam does not establish a physical fault, physical clearance, target timing, HIL, or certification.' },
      ],
      scope: 'Tests provide native POSIX host runtime and discrete-plant evidence only; the injected jam is not a physical fault, physical clearance, target timing, HIL, or certification evidence.',
    },
    {
      id: 'conveyor-two-parts-diagnosis', exampleId: 'conveyor_01', requiredScenario: 'ConveyorTwoParts', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-two-parts.scenario.json',
      title: 'Reproducible diagnosis: two parts, one decision', summary: 'Use the versioned schedule to distinguish one metal part from one non-metal part without inventing observability.',
      stages: [
        { title: 'Locate', body: 'Locate PartAtClassifier, MetalDetected, PartAtDiverter, and MetalLatched in src/Conveyor.st.', checkpoint: 'MetalLatched sets with classifier+metal and clears when the part reaches the diverter.' },
        { title: 'Predict', body: 'The first part is metal and the second is non-metal.', checkpoint: 'Expect diversion only for the first; Belt stays active for both.' },
        { title: 'Read the schedule', body: 'The JSON schedules classifier→diverter at 20→30 ms and 50→70 ms, with a 10 ms tick through 80 ms.', checkpoint: 'The three assertions are AT@30 Belt=true/Diverter=true, AT@70 Belt=true/Diverter=false, and NEVER Diverter=true with Belt=false.' },
        { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only ConveyorTwoParts.', checkpoint: 'The required scenario is named ConveyorTwoParts.' },
        { title: 'Diagnose', body: 'The Tests matrix proves host outputs: compare the 30 and 70 ms samples.', checkpoint: 'It does not prove or record inputs, physical parts, or the internal MetalLatched state.' },
        { title: 'Limits', body: 'Repeat the same scenario for a reproducible decision about host outputs.', checkpoint: 'It does not establish physical sensors or parts, target timing, hardware, HIL, or certification.' },
      ],
      scope: 'Tests provide native POSIX host runtime evidence with scenario-scheduled inputs; they are not physical sensors or parts, target timing, hardware, HIL, or certification evidence.',
    },
  ],
};
