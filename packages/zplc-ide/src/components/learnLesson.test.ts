import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { gradeRecordedScenarioLesson, LEARN_MASTERY_STORAGE_KEY, learnLessonCatalog, parseLearnMasteryImport, readLearnMastery, recordLearnMastery, replaceLearnMastery, serializeLearnMastery, type LearnLesson } from './learnLesson';
import { LEARN_CONTENT_SCHEMA_VERSION, validateLearnContentV1, type VersionedLearnLesson } from './learnContent.v1';
import { LESSON_INDEX } from '../generated/lessonIndex';

const sha = 'a'.repeat(64);

function declaredPrograms(project: string): readonly string[] {
  const manifest: unknown = JSON.parse(readFileSync(join(project, 'zplc.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !Array.isArray((manifest as { tasks?: unknown }).tasks)) return [];
  return (manifest as { tasks: unknown[] }).tasks.flatMap((task) => {
    const programs = task && typeof task === 'object' ? (task as { programs?: unknown }).programs : undefined;
    return Array.isArray(programs) && programs.every((program) => typeof program === 'string') ? programs : [];
  });
}

/** Real number of expectations in the scenario file the starter ships for the lesson. */
function starterScenarioAssertions(lesson: VersionedLearnLesson): number {
  const scenario: unknown = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'projects', lesson.starterExampleId, lesson.scenarioPath), 'utf8'));
  return (scenario as { expectations: unknown[] }).expectations.length;
}

function recordedPresentation(lesson: VersionedLearnLesson, count = lesson.rubric.minimumAssertions): WorkspaceTestPresentation {
  // The assertions a run of the lesson's own scenario records, kind for kind (a shorter run is cut from the same list).
  const assertions = Array.from({ length: count }, (_, index) => ({ kind: (lesson.scenario.expectations[index]?.kind ?? 'NEVER') as 'AT', passed: true }));
  return {
    operation: 'scenario-run', kind: 'passed', message: 'Host POSIX scenario passed.', scenarioCount: 1, diagnostics: [], hasEvidence: true,
    artifacts: [{ kind: 'zplc', sha256: sha, byteLength: 1 }, { kind: 'trace', sha256: sha, byteLength: 1 }],
    savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
    preview: { traceEvidenceSha256: sha, totalScenarioCount: 1, scenarios: [{
      id: lesson.requiredScenario, path: lesson.scenarioPath, passed: true, totalSamples: 1, totalSignals: 2, totalAssertions: count, truncated: false,
      assertions, samples: [{ atMs: 1, outputs: {} }],
    }] },
  };
}

describe('Learn lesson catalog', () => {
  it('keeps Spanish and English aligned on the same canonical lessons', () => {
    const [es, en] = [learnLessonCatalog.es, learnLessonCatalog.en];
    expect(es).toHaveLength(LESSON_INDEX.lessons.length);
    expect(en).toHaveLength(LESSON_INDEX.lessons.length);
    expect(es.map(({ id, exampleId, requiredScenario, sourcePath, scenarioPath }) => ({ id, exampleId, requiredScenario, sourcePath, scenarioPath }))).toEqual(en.map(({ id, exampleId, requiredScenario, sourcePath, scenarioPath }) => ({ id, exampleId, requiredScenario, sourcePath, scenarioPath })));
    expect(es.map(({ id }) => id)).toEqual(LESSON_INDEX.lessons.map(({ id }) => id));
    expect(es[1]).toMatchObject({ exampleId: 'pedestrian_crossing', requiredScenario: 'PedestrianCrossing', sourcePath: 'src/PedestrianCrossing.st', scenarioPath: 'tests/pedestrian-crossing.scenario.json', title: 'Cruce peatonal y estados seguros' });
    expect(en[1]).toMatchObject({ title: 'Pedestrian crossing and safe states' });
    // Lesson 8 has an extra Evidence stage; lesson 10 has its Edit stage since LRN-038 (it used to have none).
    for (const lesson of [...es, ...en].filter((lesson) => lesson.id !== 'scan-cycle-one-scan-memory' && lesson.id !== 'conveyor-two-parts-diagnosis')) expect(lesson.stages).toHaveLength(6);
    expect(es[1]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[1]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[1]?.stages[1]?.checkpoint).toBe('verde+STOP 0 ms; amarillo+STOP 20; rojo+STOP 40; rojo+WALK 60; rojo+STOP 90; verde+STOP 110.');
    expect(en[1]?.stages[1]?.checkpoint).toBe('green+STOP 0 ms; yellow+STOP 20; red+STOP 40; red+WALK 60; red+STOP 90; green+STOP 110.');
    expect(es[1]?.stages[4]?.body).toContain('matriz registrada en Pruebas');
    expect(en[1]?.stages[4]?.body).toContain('recorded matrix in Tests');
    expect(es[1]?.stages[5]?.body).toContain('NEVER');
    expect(en[1]?.stages[5]?.body).toContain('NEVER');
    for (const lesson of [es[1]!, en[1]!]) expect(lesson.scope).toMatch(/POSIX|host/i);
    expect(es[1]?.scope).toContain('no es evidencia de cruce físico, hardware, HIL ni certificación');
    expect(en[1]?.scope).toContain('not physical crossing, hardware, HIL, or certification evidence');
    expect(es[2]).toMatchObject({ exampleId: 'tank_level', requiredScenario: 'TankLevel', sourcePath: 'src/TankLevel.st', scenarioPath: 'tests/tank-level.scenario.json', title: 'Nivel de tanque, fallas y reset', scope: 'Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX, que no es evidencia de un proceso físico, hardware, HIL ni certificación.' });
    expect(en[2]).toMatchObject({ title: 'Tank level, faults, and reset', scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical-process, hardware, HIL, or certification evidence.' });
    expect(es[2]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[2]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[2]?.stages[1]?.checkpoint).toBe('Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.');
    expect(en[2]?.stages[1]?.checkpoint).toBe('Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.');
    for (const name of ['PumpLatched', 'FaultLatched', 'ResetArmed']) expect(es[2]?.stages[0]?.body).toContain(name);
    expect(es[2]?.stages[4]?.body).toContain('80/100/120/140');
    expect(en[2]?.stages[4]?.body).toContain('80/100/120/140');
    expect(es[3]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json', title: 'Cinta de clasificación y atasco seguro', scope: 'Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX, que no es evidencia de una cinta física, del despeje de un atasco, hardware, HIL ni certificación.' });
    expect(en[3]).toMatchObject({ title: 'Conveyor classification and safe jam', scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical conveyor, jam clearance, hardware, HIL, or certification evidence.' });
    expect(es[3]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[3]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[3]?.stages[1]?.checkpoint).toBe('Belt ON 10–40; Diverter ON solo 30; FaultLamp ON y Belt OFF 50–80. Reset a 60 no libera mientras JamDetected sigue activo.');
    expect(en[3]?.stages[1]?.checkpoint).toBe('Belt ON 10–40; Diverter ON only 30; FaultLamp ON and Belt OFF 50–80. Reset at 60 does not release while JamDetected remains active.');
    for (const name of ['Requested', 'Faulted', 'MetalLatched']) expect(es[3]?.stages[0]?.body).toContain(name);
    expect(es[3]?.stages[4]?.body).toContain('classifier+metal 20, diverter+count=1 a 30, jam 50');
    expect(en[3]?.stages[4]?.body).toContain('classifier+metal 20, diverter+count=1 at 30, jam 50');
    expect(es[3]?.stages[5]?.body).toBe('La aserción NEVER cubre DiverterCommand ON con BeltCommand OFF solo en este escenario.');
    expect(en[3]?.stages[5]?.body).toBe('The NEVER assertion covers DiverterCommand ON with BeltCommand OFF only in this scenario.');
    expect(es[4]).toMatchObject({ exampleId: 'blinky', requiredScenario: 'BlinkyVisual', sourcePath: 'src/Blinky.ld.json', scenarioPath: 'tests/blinky-visual.scenario.json', title: 'Oscilador TON y realimentación de salida', scope: 'Las pruebas aportan solo evidencia del host con el runtime nativo POSIX; no son evidencia de un LED físico, de los tiempos del hardware, de HIL ni de certificación.' });
    expect(en[4]).toMatchObject({ title: 'TON oscillator and output feedback', scope: 'Tests provide native POSIX host evidence only; they are not physical LED, hardware timing, HIL, or certification evidence.' });
    expect(es[4]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[4]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[4]?.stages[1]?.checkpoint).toBe('En OFF a los 250 ms, en ON a los 750, en OFF a los 1250, en ON a los 1750; el primer flanco ascendente llega entre los 400 y los 600 ms.');
    expect(en[4]?.stages[1]?.checkpoint).toBe('OFF at 250 ms, ON at 750, OFF at 1250, ON at 1750; the first rising edge lands between 400 and 600 ms.');
    // LRN-038: lesson 5 has the learner edit a Ladder program. The starter is a Ladder file with the two timer rungs drawn and
    // the lesson names the rungs and the file the learner really gets.
    for (const lesson of [es[4]!, en[4]!]) {
      const text = lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ');
      for (const value of ['src/Blinky.ld.json', 'LED_Output', 'OffTimer.Q', 'OnTimer.Q', 'SET', 'RESET']) expect(`${lesson.sourcePath} ${text}`).toContain(value);
      expect(lesson.sourcePath).toBe('src/Blinky.ld.json');
      expect(lesson.languages).toEqual(['LD']);
      // The Structured Text names of the old lesson are gone.
      expect(text).not.toMatch(/Blinky\.st|BlinkTimer|LedState|IN := FALSE/);
    }
    // The reference of lesson 5 is the Ladder project, and the rungs and instances the lesson names are the ones it has.
    expect(es[4]).toMatchObject({ exampleId: 'blinky', starterExampleId: 'blinky_starter', referenceExampleId: 'blinky' });
    expect(en[4]).toMatchObject({ exampleId: 'blinky', starterExampleId: 'blinky_starter', referenceExampleId: 'blinky' });
    const reference = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'projects', 'blinky', 'src', 'main.ld.json'), 'utf8')) as { rungs: Array<{ grid: Array<Array<{ element: { type: string; variable?: string; instance?: string } | null }>> }> };
    const elements = reference.rungs.flatMap((rung) => rung.grid.flat().flatMap((cell) => cell.element ? [cell.element] : []));
    expect(elements.filter((element) => element.type === 'coil_set').map((element) => element.variable)).toEqual(['LED_Output']);
    expect(elements.filter((element) => element.type === 'coil_reset').map((element) => element.variable)).toEqual(['LED_Output']);
    expect(elements.filter((element) => element.instance).map((element) => element.instance)).toEqual(['OffTimer', 'OnTimer']);
    // The starter ships the two timer rungs and no coil: a learner edits it by adding the two rungs.
    const starter = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'projects', 'blinky_starter', 'src', 'Blinky.ld.json'), 'utf8')) as { rungs: unknown[] };
    expect(starter.rungs).toHaveLength(2);
    for (const lesson of [es[4]!, en[4]!]) expect(lesson.faultCases.join(' ')).not.toMatch(/OFF y ON|OFF and ON half/);
    expect(es[5]).toMatchObject({ exampleId: 'motor_plant', requiredScenario: 'MotorPlant', sourcePath: 'src/MotorPlant.st', scenarioPath: 'tests/motor-plant.scenario.json', title: 'Orden, realimentación y velocidad', summary: 'Separe la orden del motor de la confirmación de marcha usando la planta Motor Plant.', scope: 'Las pruebas aportan solo evidencia determinista del host con el runtime nativo POSIX y de la planta discreta; no son evidencia de un motor físico, hardware, HIL ni certificación.' });
    expect(en[5]).toMatchObject({ title: 'Command, feedback, and speed', summary: 'Separate a motor command from the run confirmation using the Motor Plant.', scope: 'Tests provide deterministic native POSIX host and discrete-plant evidence only; they are not physical-motor, hardware, HIL, or certification evidence.' });
    expect(es[5]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[5]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[5]?.stages[1]?.checkpoint).toBe('0 ms: Command/Running OFF; 10: Command ON y Running OFF; 30: ambos ON; 40: ambos OFF.');
    expect(en[5]?.stages[1]?.checkpoint).toBe('0 ms: Command/Running OFF; 10: Command ON and Running OFF; 30: both ON; 40: both OFF.');
    expect(es[5]?.stages[4]?.checkpoint).toBe('La matriz y la traza registradas muestran el avance discreto de speed/AtSpeed.');
    expect(en[5]?.stages[0]?.checkpoint).toBe('Command reflects the request; Running also depends on AtSpeed.');
    expect(es[5]?.stages[0]?.body).toContain('Requested, Command y Running');
    expect(en[5]?.stages[0]?.body).toContain('Requested, Command, and Running');
    expect(es[5]?.stages[4]?.body).toContain('10 con 30 ms');
    expect(en[5]?.stages[4]?.body).toContain('10 with 30 ms');
    expect(es[5]?.stages[5]?.body).toBe('RISING/FALLING cubren esta transición y NEVER comprueba que Running no aparezca sin Command dentro de este escenario.');
    expect(en[5]?.stages[5]?.body).toBe('RISING/FALLING cover this transition, and NEVER checks that Running never appears without Command in this scenario.');
    expect(es[6]).toMatchObject({ exampleId: 'edge_counter', requiredScenario: 'EdgeCounter', sourcePath: 'src/EdgeCounter.st', scenarioPath: 'tests/edge-counter.scenario.json', title: 'Flancos y contador de pulsos', summary: 'Use un contador CTU para contar tres pulsos discretos y poner la cuenta a cero.', scope: 'Las pruebas aportan solo evidencia del host con el runtime nativo POSIX; no son evidencia de un sensor físico, de rebotes, de hardware, de HIL ni de certificación.' });
    expect(en[6]).toMatchObject({ title: 'Edges and pulse counter', summary: 'Use a CTU counter to count three discrete pulses and reset the count.', scope: 'Tests provide native POSIX host evidence only; they are not physical-sensor, bounce, hardware, HIL, or certification evidence.' });
    expect(es[6]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Observe', 'Reflexione']);
    expect(en[6]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[6]?.stages[0]).toEqual({ title: 'Objetivo', body: 'En src/EdgeCounter.st, use PulseInput, Reset y CountReached y agregue una instancia Count (CTU) con PV=3.', checkpoint: 'CTU cuenta una vez cada flanco ascendente de PulseInput, sin importar cuánto tiempo siga en alto el pulso; Reset borra la cuenta.' });
    expect(en[6]?.stages[0]).toEqual({ title: 'Objective', body: 'In src/EdgeCounter.st, use PulseInput, Reset, and CountReached and add a Count (CTU) instance with PV=3.', checkpoint: 'CTU counts each rising edge of PulseInput once, however long the pulse stays high; Reset clears the count.' });
    expect(es[6]?.stages[1]).toEqual({ title: 'Prediga', body: 'Antes de ejecutar, prediga cuándo el contador alcanza PV=3.', checkpoint: 'CountReached permanece en OFF a los 0, 10 y 30 ms; pasa a ON a los 50, tras el tercer flanco, y vuelve a OFF a los 70 con Reset.' });
    expect(en[6]?.stages[1]).toEqual({ title: 'Predict', body: 'Before running, predict when the counter reaches PV=3.', checkpoint: 'CountReached stays OFF at 0, 10, and 30 ms; turns ON at 50 after the third edge; returns OFF at 70 with Reset.' });
    expect(es[6]?.stages[4]).toEqual({ title: 'Observe', body: 'Compare los eventos de 10, 30, 50 y 70 ms con la salida CountReached.', checkpoint: 'El tercer pulso alcanza PV=3; Reset domina y devuelve CountReached a OFF.' });
    expect(en[6]?.stages[4]).toEqual({ title: 'Observe', body: 'Compare 10, 30, 50, and 70 ms with CountReached.', checkpoint: 'The third pulse reaches PV=3; Reset dominates and returns CountReached to OFF.' });
    expect(es[6]?.stages[5]).toEqual({ title: 'Reflexione', body: 'Las aserciones AT/RISING/FALLING cubren esta secuencia lógica discreta.', checkpoint: 'No demuestran rebotes, pulsos eléctricos, tiempos del hardware, HIL ni certificación.' });
    expect(en[6]?.stages[5]).toEqual({ title: 'Reflect', body: 'The AT/RISING/FALLING assertions cover this discrete logical sequence.', checkpoint: 'They do not establish bounce, electrical pulses, hardware timing, HIL, or certification.' });
    expect(es[7]).toMatchObject({ exampleId: 'scan_snapshot', requiredScenario: 'ScanSnapshot', sourcePath: 'src/ScanSnapshot.st', scenarioPath: 'tests/scan-snapshot.scenario.json', title: 'Ciclo de escaneo y memoria de un ciclo', summary: 'Siga cómo una entrada produce la salida actual y una copia demorada un ciclo.', scope: 'Las pruebas aportan evidencia del host con el runtime nativo POSIX y una única tarea de 10 ms; no demuestran los tiempos en el dispositivo de destino, las instantáneas bajo interrupciones físicas, el rebote eléctrico, HIL ni certificación.' });
    expect(en[7]).toMatchObject({ title: 'Scan cycle and one-scan memory', summary: 'Follow how one input produces the current output and a copy delayed by one scan.', scope: 'Tests provide native POSIX host runtime evidence with one 10 ms task; they do not establish target timing, snapshots under physical interrupts, electrical bounce, HIL, or certification.' });
    expect(es[7]?.stages[2]).toMatchObject({ title: 'Edite', checkpoint: 'El escenario visible debe pasar con evidencia guardada del host.' });
    expect(en[7]?.stages[2]).toMatchObject({ title: 'Edit', checkpoint: 'The visible scenario must pass with saved host evidence.' });
    expect(es[8]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'ConveyorJamTiming', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-jam-timing.scenario.json', title: 'Aserciones temporales y falla por atasco', scope: 'Las pruebas aportan solo evidencia del host con el runtime nativo POSIX y entradas discretas; el atasco programado no es evidencia de una falla física, del despeje físico, de los tiempos en el dispositivo de destino, de HIL ni de certificación.' });
    expect(en[8]).toMatchObject({ title: 'Temporal assertions and jam fault', scope: 'Tests provide native POSIX host runtime and discrete-input evidence only; the scheduled jam is not a physical fault, physical clearance, target timing, HIL, or certification evidence.' });
    expect(es[8]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Prediga', 'Edite', 'Ejecute', 'Contraste', 'Reflexione']);
    expect(en[8]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Compare', 'Reflect']);
    expect(es[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).not.toContain('no requiere editar el programa');
    expect(en[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).not.toContain('does not require editing');
    for (const operator of ['AT', 'WITHIN', 'FOR', 'UNTIL', 'FALLING', 'RISING', 'NEVER']) {
      expect(es[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(operator);
      expect(en[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(operator);
    }
    for (const timing of ['0 ms', '20', '30', '40', '50', '60', '80']) {
      expect(es[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(timing);
      expect(en[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(timing);
    }
    expect(es[8]?.stages[1]?.checkpoint).toBe('Belt ON y FaultLamp OFF a 20; Belt OFF y FaultLamp ON a 30 y todavía a 50 (Reset a 40 se ignora y despejar el atasco no libera la falla); ambos OFF a 60; Belt ON de nuevo a 80 solo tras el nuevo Start.');
    expect(en[8]?.stages[1]?.checkpoint).toBe('Belt ON and FaultLamp OFF at 20; Belt OFF and FaultLamp ON at 30 and still at 50 (Reset at 40 is ignored and the jam clearing does not release the fault); both OFF at 60; Belt ON again at 80 only after the new Start.');
    // Lessons 4 and 9 share a starter but no longer a graded scenario or a fault to fix.
    expect(es[3]?.starterExampleId).toBe(es[8]?.starterExampleId);
    expect(es[3]?.requiredScenario).not.toBe(es[8]?.requiredScenario);
    expect(es[3]?.scenarioPath).not.toBe(es[8]?.scenarioPath);
    expect(es[3]?.faultCases).not.toEqual(es[8]?.faultCases);
    expect(en[3]?.faultCases).not.toEqual(en[8]?.faultCases);
    expect(es[9]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'ConveyorTwoParts', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-two-parts.scenario.json', title: 'Diagnóstico reproducible: dos piezas, una decisión', scope: 'Las pruebas aportan evidencia del host con el runtime nativo POSIX y entradas programadas por el escenario; no son evidencia de sensores ni de piezas físicas, de los tiempos en el dispositivo de destino, de hardware, de HIL ni de certificación.' });
    expect(en[9]).toMatchObject({ title: 'Reproducible diagnosis: two parts, one decision', scope: 'Tests provide native POSIX host runtime evidence with scenario-scheduled inputs; they are not physical sensors or parts, target timing, hardware, HIL, or certification evidence.' });
    expect(es[9]?.stages.map(({ title }) => title)).toEqual(['Ubique', 'Prediga', 'Lea el calendario', 'Edite', 'Ejecute', 'Diagnostique', 'Límites']);
    expect(en[9]?.stages.map(({ title }) => title)).toEqual(['Locate', 'Predict', 'Read the schedule', 'Edit', 'Run', 'Diagnose', 'Limits']);
    for (const lesson of [es[9]!, en[9]!]) {
      expect(lesson.stages).toHaveLength(7);
      expect(lesson.stageKeys).toContain('edit');
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('AT@30');
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('AT@70');
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('NEVER');
    }
    expect(es[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=true');
    expect(es[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=false');
    expect(en[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=true');
    expect(en[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=false');
    expect(validateLearnContentV1(learnLessonCatalog)).toBe(true);
    for (const lesson of [...es, ...en]) {
      expect(lesson.schemaVersion).toBe(LEARN_CONTENT_SCHEMA_VERSION);
      expect(lesson.visibleScenarioIds).toEqual([lesson.requiredScenario]);
      expect(lesson.rubric).toEqual({ requiredScenarioId: lesson.requiredScenario, minimumAssertions: starterScenarioAssertions(lesson), requireSavedEvidence: true });
      expect(lesson.rubric.minimumAssertions).toBeGreaterThanOrEqual(3);
      expect(lesson.faultCases.length).toBeGreaterThan(0);
    }
    expect(es[8]).toMatchObject({ starterExampleId: 'conveyor_01_starter', referenceExampleId: 'conveyor_01', authorScenarioIds: ['Conveyor01'] });
    expect(es[3]?.authorScenarioIds).toEqual([]);
    expect(es.every((lesson) => lesson.starterExampleId !== lesson.referenceExampleId)).toBe(true);
    expect(es.flatMap((lesson) => lesson.faultCases).join(' ')).not.toContain('The starter');
    expect(en.flatMap((lesson) => lesson.faultCases).join(' ')).toContain('The starter');
  });

  it('declares published starter, reference, source, and scenario resources only', () => {
    const projects = join(import.meta.dir, '..', '..', 'projects');
    for (const lessons of Object.values(learnLessonCatalog)) for (const lesson of lessons) {
      const starter = join(projects, lesson.starterExampleId);
      const reference = join(projects, lesson.referenceExampleId);
      expect(existsSync(join(starter, 'zplc.json'))).toBe(true);
      expect(declaredPrograms(starter)).not.toHaveLength(0);
      // A visual program (`Blinky.ld`) is the file `Blinky.ld.json`.
      for (const program of declaredPrograms(starter)) expect(existsSync(join(starter, 'src', program)) || existsSync(join(starter, 'src', `${program}.json`))).toBe(true);
      expect(existsSync(join(projects, lesson.starterExampleId, lesson.scenarioPath))).toBe(true);
      expect(existsSync(join(reference, 'zplc.json'))).toBe(true);
      expect(declaredPrograms(reference)).not.toHaveLength(0);
      // A reference in another language than the starter would send the learner to a file they cannot compare (lesson 5 once pointed a Structured Text starter at the Ladder Blinky).
      // (a visual program `Blinky.ld.json` is a program of the language `.ld`).
      const sourceLanguage = lesson.sourcePath.replace(/\.json$/, '');
      expect({ lesson: lesson.id, sameLanguage: declaredPrograms(reference).some((program) => program.endsWith(sourceLanguage.slice(sourceLanguage.lastIndexOf('.')))) }).toEqual({ lesson: lesson.id, sameLanguage: true });
      for (const program of declaredPrograms(reference)) {
        const direct = join(reference, 'src', program);
        const visual = join(reference, 'src', `${program}.json`);
        expect(existsSync(direct) || existsSync(visual)).toBe(true);
      }
      // starterGrading.test.ts reads the reference scenario for every lesson that does not document its own.
      const shipped = new Map(readdirSync(join(starter, 'tests')).map((file) => [(JSON.parse(readFileSync(join(starter, 'tests', file), 'utf8')) as { id: string }).id, file]));
      expect(shipped.get(lesson.requiredScenario)).toBe(lesson.scenarioPath.replace('tests/', ''));
      for (const authorScenarioId of lesson.authorScenarioIds) expect(shipped.has(authorScenarioId)).toBe(true);
    }
  });

  it('keeps lesson text, starter source, and scenario in agreement', () => {
    const projects = join(import.meta.dir, '..', '..', 'projects');
    for (const lesson of [...learnLessonCatalog.es, ...learnLessonCatalog.en]) {
      const starter = join(projects, lesson.starterExampleId);
      const scenario = JSON.parse(readFileSync(join(starter, lesson.scenarioPath), 'utf8')) as { id: string; tickMs: number; durationMs: number; expectations: unknown[] };
      const text = lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ');
      // The lesson names only files the learner actually gets: lesson 5 used to cite src/main.ld, a Ladder file the starter does not have.
      expect(existsSync(join(starter, lesson.sourcePath))).toBe(true);
      expect(scenario.id).toBe(lesson.requiredScenario);
      for (const path of text.match(/\b(?:src|tests)\/[\w.-]*\w/g) ?? []) expect({ lesson: lesson.id, path, exists: existsSync(join(starter, path)) }).toEqual({ lesson: lesson.id, path, exists: true });
      // The Run stage states the real number of assertions in the graded scenario.
      const run = lesson.stages[lesson.stageKeys.indexOf('run')]!;
      expect({ lesson: lesson.id, run: run.checkpoint }).toEqual({ lesson: lesson.id, run: expect.stringContaining(lesson.locale === 'en' ? `contains ${scenario.expectations.length} assertions` : `contiene ${scenario.expectations.length} aserciones`) });
      // Every instant the lesson predicts exists in the scenario's time base.
      const predicted = lesson.stages[lesson.stageKeys.indexOf('predict')]!;
      for (const [, value] of `${predicted.body} ${predicted.checkpoint}`.matchAll(/(\d+) ?ms/g)) expect({ lesson: lesson.id, atMs: Number(value), inScenario: Number(value) <= scenario.durationMs && Number(value) % scenario.tickMs === 0 }).toEqual({ lesson: lesson.id, atMs: Number(value), inScenario: true });
    }
  });

  it('predicts every recorded sample of the scan-cycle scenario (the lesson used to expect 4 samples from a 2-sample starter)', () => {
    const projects = join(import.meta.dir, '..', '..', 'projects');
    for (const lesson of [learnLessonCatalog.es[7]!, learnLessonCatalog.en[7]!]) {
      const scenario = JSON.parse(readFileSync(join(projects, lesson.starterExampleId, lesson.scenarioPath), 'utf8')) as { tickMs: number; durationMs: number };
      expect(lesson.stages[1]!.checkpoint.match(/@\d+/g)).toHaveLength(scenario.durationMs / scenario.tickMs + 1);
    }
  });

  it('does not make lesson 7 require R_TRIG or an Edge variable: CTU alone must be a complete solution', () => {
    const projects = join(import.meta.dir, '..', '..', 'projects');
    for (const lesson of [learnLessonCatalog.es[6]!, learnLessonCatalog.en[6]!]) {
      const text = [lesson.title, lesson.summary, ...lesson.stages.flatMap(({ body, checkpoint }) => [body, checkpoint]), ...lesson.faultCases].join(' ');
      expect(text).not.toMatch(/R_TRIG|\bEdge\b/);
    }
    expect(readFileSync(join(projects, 'edge_counter_starter', 'src', 'EdgeCounter.st'), 'utf8')).not.toMatch(/R_TRIG|\bEdge\b/);
  });

  it('keeps the Spanish copy in parity with the English copy: same numbers, file paths, and fault', () => {
    const facts = (text: string): string[] => [...(text.match(/\d+|\b(?:src|tests)\/[\w.-]*\w/g) ?? [])].sort();
    learnLessonCatalog.en.forEach((english, index) => {
      const spanish = learnLessonCatalog.es[index]!;
      expect(spanish.stages).toHaveLength(english.stages.length);
      english.stages.forEach((stage, stageIndex) => {
        const peer = spanish.stages[stageIndex]!;
        // The Edit stage body is generated from the fault case, so its parity is checked through faultCases below.
        expect({ lesson: english.id, stage: stageIndex, facts: facts(`${peer.body} ${peer.checkpoint}`) }).toEqual({ lesson: english.id, stage: stageIndex, facts: facts(`${stage.body} ${stage.checkpoint}`) });
      });
      expect({ lesson: english.id, facts: facts(spanish.faultCases.join(' ')) }).toEqual({ lesson: english.id, facts: facts(english.faultCases.join(' ')) });
    });
  });

  it('grades complete recorded scenario evidence generically for all ten lessons', () => {
    for (const lesson of learnLessonCatalog.en) {
      const passed = recordedPresentation(lesson);
      expect(gradeRecordedScenarioLesson(lesson, undefined)).toEqual({ kind: 'not-run' });
      expect(gradeRecordedScenarioLesson(lesson, passed)).toEqual({ kind: 'passed', assertions: lesson.rubric.minimumAssertions });
      const failedAssertions = passed.preview!.scenarios[0]!.assertions.map((assertion, index) => ({ ...assertion, passed: index !== 0 }));
      const failed = gradeRecordedScenarioLesson(lesson, { ...passed, kind: 'assertion-failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'failed' }], preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, passed: false, assertions: failedAssertions }] } });
      expect(failed).toMatchObject({ kind: 'failed', assertions: lesson.rubric.minimumAssertions });
      expect(failed.kind === 'failed' && failed.failures.map(({ index }) => index)).toEqual([0]);
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, operation: 'test' })).toEqual({ kind: 'unrelated' });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, id: 'Other' }] } })).toEqual({ kind: 'unrelated' });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, hasEvidence: false })).toEqual({ kind: 'unavailable' });
    }
  });

  it('requires every assertion of the lesson scenario: a one-assertion run is not mastery (a weakened scenario file cannot grant it)', () => {
    for (const lesson of learnLessonCatalog.en) {
      expect(lesson.rubric.minimumAssertions).toBe(starterScenarioAssertions(lesson));
      for (const fewer of [1, lesson.rubric.minimumAssertions - 1]) {
        const grade = gradeRecordedScenarioLesson(lesson, recordedPresentation(lesson, fewer));
        expect(grade).toEqual({ kind: 'unavailable' });
        const writes: string[] = [];
        expect(recordLearnMastery(lesson.id, grade, new Set(), { getItem: () => null, setItem: (_key, value) => writes.push(value) }).size).toBe(0);
        expect(writes).toEqual([]);
      }
    }
  });

  it('rejects incomplete or inconsistent evidence before grading', () => {
    const lesson = learnLessonCatalog.en[0]!;
    const passed = recordedPresentation(lesson);
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, artifacts: [passed.artifacts[0]!] })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, artifacts: [...passed.artifacts, passed.artifacts[0]!] })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'unexpected' }] })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, scenarioCount: 2 })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, totalScenarioCount: 2 } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, totalAssertions: 2 }] } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, totalSamples: 2 }] } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, traceEvidenceSha256: 'b'.repeat(64) } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, savedTestInputIdentity: { schemaVersion: 1, sha256: 'bad', fileCount: 0 } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 2 } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, truncated: true }] } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, passed: false, assertions: [{ kind: 'NEVER', passed: false }] }] } })).toEqual({ kind: 'unavailable' });
    expect(gradeRecordedScenarioLesson(lesson, { ...passed, kind: 'assertion-failed' })).toEqual({ kind: 'unavailable' });
    // A rubric that does not require saved evidence is outside the declared lesson contract, so the grader must refuse it.
    expect(gradeRecordedScenarioLesson({ ...lesson, rubric: { ...lesson.rubric, requireSavedEvidence: false } } as unknown as typeof lesson, passed)).toEqual({ kind: 'unavailable' });
  });
});

describe('Learn lesson text is never replaced at run time (LRN-038)', () => {
  it('hands the panel exactly the strings of the generated index, in both languages, for every lesson', () => {
    for (const locale of ['en', 'es'] as const) {
      expect<string[]>(learnLessonCatalog[locale].map(({ id }) => id)).toEqual(LESSON_INDEX.lessons.map(({ id }) => id));
      learnLessonCatalog[locale].forEach((lesson, index) => {
        const source = LESSON_INDEX.lessons[index]!.text[locale];
        expect({ id: lesson.id, title: lesson.title, summary: lesson.summary, scope: lesson.scope, stages: lesson.stages, faultCases: lesson.faultCases, objectives: lesson.objectives, hints: lesson.hints })
          .toEqual({ id: lesson.id, title: source.title, summary: source.summary, scope: source.scope, stages: source.stages.map(({ title, body, checkpoint }) => ({ title, body, checkpoint })), faultCases: source.faultCases, objectives: source.objectives, hints: source.hints.map(({ text }) => text) });
      });
    }
  });

  it('gives every lesson an Edit stage that says what to edit, lesson 5 and lesson 10 included', () => {
    for (const lesson of [...learnLessonCatalog.en, ...learnLessonCatalog.es]) {
      const edit = lesson.stages[lesson.stageKeys.indexOf('edit')];
      expect({ id: lesson.id, hasEdit: edit !== undefined, mentionsFault: edit?.body.includes(lesson.faultCases[0] ?? '\0') }).toEqual({ id: lesson.id, hasEdit: true, mentionsFault: true });
    }
  });
});

describe('Learn grading against the lesson package (LRN-022, LRN-026)', () => {
  it('does not grade a run of a scenario whose assertions are not the lesson\'s own, however complete its evidence', () => {
    for (const lesson of learnLessonCatalog.en) {
      const passed = recordedPresentation(lesson);
      const scenario = passed.preview!.scenarios[0]!;
      // The learner weakened the scenario in the workspace: same name, same number of assertions, one of another kind.
      const edited = scenario.assertions.map((assertion, index) => index === 0 ? { ...assertion, kind: assertion.kind === 'NEVER' ? 'ALWAYS' as const : 'NEVER' as const } : assertion);
      const grade = gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...scenario, assertions: edited }] } });
      expect(grade).toEqual({ kind: 'scenario-changed' });
      expect(recordLearnMastery(lesson.id, grade, new Set(), { getItem: () => null, setItem: () => { throw new Error('must not write'); } }).size).toBe(0);
    }
  });

  it('says which assertion failed, at what time, expected against observed, and links the trace point', () => {
    const lesson = learnLessonCatalog.en.find(({ id }) => id === 'motor-plant-feedback')!;
    const passed = recordedPresentation(lesson);
    const at = lesson.scenario.expectations.findIndex((expectation) => expectation.kind === 'AT' && expectation.atMs === 30);
    expect(at).toBeGreaterThanOrEqual(0);
    const scenario = passed.preview!.scenarios[0]!;
    const assertions = scenario.assertions.map((assertion, index) => index === at ? { ...assertion, passed: false, atMs: 30 } : assertion);
    const samples = [{ atMs: 30, outputs: { 'MotorPlant.Command': true, 'MotorPlant.Running': false } }];
    const grade = gradeRecordedScenarioLesson(lesson, { ...passed, kind: 'assertion-failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'failed' }], preview: { ...passed.preview!, scenarios: [{ ...scenario, passed: false, assertions, samples }] } });
    expect(grade).toMatchObject({ kind: 'failed' });
    if (grade.kind !== 'failed') return;
    expect(grade.failures).toEqual([{
      index: at, kind: 'AT', atMs: 30,
      expected: { 'MotorPlant.Command': true, 'MotorPlant.Running': true },
      observed: { 'MotorPlant.Command': true, 'MotorPlant.Running': false },
      trace: { scenarioId: 'MotorPlant', traceSha256: sha, cursor: 3, atMs: 30, uri: `zplc://runtime/snapshot/MotorPlant/3/${sha}` },
    }]);
  });

  it('carries the package metadata the lesson declares: version, scenario hash, objectives and two hint levels', () => {
    for (const lesson of [...learnLessonCatalog.es, ...learnLessonCatalog.en]) {
      expect(lesson.version).toBeGreaterThanOrEqual(1);
      expect(lesson.scenarioSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(lesson.objectives.length).toBeGreaterThan(0);
      expect(lesson.hints).toHaveLength(2);
      expect(lesson.stageKeys.filter((key) => ['objective', 'predict', 'edit', 'run', 'observe', 'reflect'].includes(key))).toEqual(['objective', 'predict', 'edit', 'run', 'observe', 'reflect']);
    }
  });
});

describe('Learn mastery persistence', () => {
  const motor = learnLessonCatalog.en[0]!;
  const pedestrian = learnLessonCatalog.en[1]!;
  const existingCatalog = learnLessonCatalog.en.slice(0, 7);
  const edgeCounter = learnLessonCatalog.en[6]!;
  const scanSnapshot = learnLessonCatalog.en[7]!;
  const temporalAssertions = learnLessonCatalog.en[8]!;
  const storage = (value: unknown, setItem: (key: string, next: string) => void = () => {}) => ({ getItem: () => value as string | null, setItem });
  const ids = (mastered: ReadonlySet<string>) => [...mastered];

  it('reads only the exact canonical envelope and fails closed for malformed storage', () => {
    expect(LEARN_MASTERY_STORAGE_KEY).toBe('zplc:learn-mastery:v1');
    expect(ids(readLearnMastery(storage(null)))).toEqual([]);
    const valid = readLearnMastery(storage(JSON.stringify({ schemaVersion: 1, mastered: [motor.id, pedestrian.id] })));
    expect(ids(valid)).toEqual([motor.id, pedestrian.id]);
    const existingEnvelope = JSON.stringify({ schemaVersion: 1, mastered: existingCatalog.map(({ id }) => id) });
    expect(ids(readLearnMastery(storage(existingEnvelope)))).toEqual(existingCatalog.map(({ id }) => id));
    for (const value of [
      '{',
      'x'.repeat(4097),
      'é'.repeat(2049),
      JSON.stringify({ schemaVersion: 1, mastered: [], extra: true }),
      JSON.stringify({ schemaVersion: 2, mastered: [] }),
      JSON.stringify({ schemaVersion: 1, mastered: [motor.id, motor.id] }),
      JSON.stringify({ schemaVersion: 1, mastered: [scanSnapshot.id, edgeCounter.id] }),
      JSON.stringify({ schemaVersion: 1, mastered: [temporalAssertions.id, scanSnapshot.id] }),
      JSON.stringify({ schemaVersion: 1, mastered: ['unknown'] }),
      JSON.stringify({ schemaVersion: 1, mastered: [1] }),
    ]) expect(ids(readLearnMastery(storage(value)))).toEqual([]);
    const sparse = [] as string[]; sparse.length = 1;
    const accessor = Object.defineProperty([], '0', { enumerable: true, get: () => motor.id });
    const objectAccessor = Object.defineProperty({ mastered: [] }, 'schemaVersion', { enumerable: true, get: () => 1 });
    const symbol = { schemaVersion: 1, mastered: [] }; Object.defineProperty(symbol, Symbol('extra'), { value: true });
    const hidden = { schemaVersion: 1, mastered: [] }; Object.defineProperty(hidden, 'extra', { value: true });
    const proxy = new Proxy({ schemaVersion: 1, mastered: [] }, { get: () => { throw new Error('nope'); } });
    expect(ids(readLearnMastery(storage({ schemaVersion: 1, mastered: sparse })))).toEqual([]);
    expect(ids(readLearnMastery(storage({ schemaVersion: 1, mastered: accessor })))).toEqual([]);
    expect(ids(readLearnMastery(storage(objectAccessor)))).toEqual([]);
    expect(ids(readLearnMastery(storage(symbol)))).toEqual([]);
    expect(ids(readLearnMastery(storage(hidden)))).toEqual([]);
    expect(ids(readLearnMastery(storage(proxy)))).toEqual([]);
    expect(ids(readLearnMastery({ getItem: () => { throw new Error('nope'); }, setItem: () => {} }))).toEqual([]);
  });

  it('writes the canonical envelope only for an approved grade and preserves state on storage failure', () => {
    const writes: string[] = [];
    const approved = gradeRecordedScenarioLesson(motor, recordedPresentation(motor));
    const initial = new Set<LearnLesson['id']>();
    const mastered = recordLearnMastery(motor.id, approved, initial, storage(null, (_key, value) => writes.push(value)));
    expect(ids(mastered)).toEqual([motor.id]);
    expect(writes).toEqual([JSON.stringify({ schemaVersion: 1, mastered: [motor.id] })]);
    expect(recordLearnMastery(motor.id, approved, mastered, storage(null, (_key, value) => writes.push(value)))).toBe(mastered);
    expect(writes).toHaveLength(1);
    for (const grade of [{ kind: 'failed', assertions: 1, failures: [] }, { kind: 'not-run' }, { kind: 'unavailable' }, { kind: 'unrelated' }, { kind: 'scenario-changed' }] as const) expect(recordLearnMastery(pedestrian.id, grade, mastered, storage(null, (_key, value) => writes.push(value)))).toBe(mastered);
    expect(writes).toHaveLength(1);
    expect(recordLearnMastery(pedestrian.id, approved, mastered, storage(null, () => { throw new Error('nope'); }))).toBe(mastered);
    const allPrevious = new Set<LearnLesson['id']>(existingCatalog.map(({ id }) => id));
    const withScanSnapshot = recordLearnMastery(scanSnapshot.id, gradeRecordedScenarioLesson(scanSnapshot, recordedPresentation(scanSnapshot)), allPrevious, storage(null, (_key, value) => writes.push(value)));
    expect(ids(withScanSnapshot)).toEqual([...existingCatalog.map(({ id }) => id), scanSnapshot.id]);
    expect(writes.at(-1)).toBe(JSON.stringify({ schemaVersion: 1, mastered: [...existingCatalog.map(({ id }) => id), scanSnapshot.id] }));
    const withTemporalAssertions = recordLearnMastery(temporalAssertions.id, gradeRecordedScenarioLesson(temporalAssertions, recordedPresentation(temporalAssertions)), withScanSnapshot, storage(null, (_key, value) => writes.push(value)));
    expect(ids(withTemporalAssertions)).toEqual([...existingCatalog.map(({ id }) => id), scanSnapshot.id, temporalAssertions.id]);
    expect(writes.at(-1)).toBe(JSON.stringify({ schemaVersion: 1, mastered: [...existingCatalog.map(({ id }) => id), scanSnapshot.id, temporalAssertions.id] }));
  });

  it('exports and imports only canonical bounded mastery in catalog order', () => {
    const valid = serializeLearnMastery(new Set([temporalAssertions.id, motor.id]));
    expect(valid).toBe(JSON.stringify({ schemaVersion: 1, mastered: [motor.id, temporalAssertions.id] }));
    expect(ids(parseLearnMasteryImport(valid)!)).toEqual([motor.id, temporalAssertions.id]);
    for (const malformed of ['{', 'x'.repeat(4097), 'é'.repeat(2049), JSON.stringify({ schemaVersion: 1, mastered: [motor.id, motor.id] }), JSON.stringify({ schemaVersion: 1, mastered: ['unknown'] }), JSON.stringify({ schemaVersion: 1, mastered: [temporalAssertions.id, motor.id] })]) expect(parseLearnMasteryImport(malformed)).toBeUndefined();
    const previous = new Set<LearnLesson['id']>([motor.id]); const writes: string[] = [];
    const merged = replaceLearnMastery(new Set([motor.id, pedestrian.id]), previous, storage(null, (_key, value) => writes.push(value)));
    expect(ids(merged)).toEqual([motor.id, pedestrian.id]);
    expect(writes).toEqual([JSON.stringify({ schemaVersion: 1, mastered: [motor.id, pedestrian.id] })]);
    expect(replaceLearnMastery(new Set([motor.id, pedestrian.id]), previous, storage(null, () => { throw new Error('nope'); }))).toBe(previous);
  });
});
