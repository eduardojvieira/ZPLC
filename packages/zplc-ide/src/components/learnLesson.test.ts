import { describe, expect, it } from 'bun:test';
import type { WorkspaceTestPresentation } from './workspaceTestPresentation';
import { gradeRecordedScenarioLesson, LEARN_MASTERY_STORAGE_KEY, learnLessonCatalog, readLearnMastery, recordLearnMastery, type LearnLesson } from './learnLesson';

const sha = 'a'.repeat(64);

function recordedPresentation(lesson: LearnLesson): WorkspaceTestPresentation {
  return {
    operation: 'scenario-run', kind: 'passed', message: 'Host POSIX scenario passed.', scenarioCount: 1, diagnostics: [], hasEvidence: true,
    artifacts: [{ kind: 'zplc', sha256: sha, byteLength: 1 }, { kind: 'trace', sha256: sha, byteLength: 1 }],
    savedTestInputIdentity: { schemaVersion: 1, sha256: sha, fileCount: 3 },
    preview: { traceEvidenceSha256: sha, totalScenarioCount: 1, scenarios: [{
      id: lesson.requiredScenario, path: lesson.scenarioPath, passed: true, totalSamples: 1, totalSignals: 2, totalAssertions: 1, truncated: false,
      assertions: [{ kind: 'NEVER', passed: true }], samples: [{ atMs: 1, outputs: {} }],
    }] },
  };
}

describe('Learn lesson catalog', () => {
  it('keeps Spanish and English aligned on the same ten canonical lessons', () => {
    const [es, en] = [learnLessonCatalog.es, learnLessonCatalog.en];
    expect(es).toHaveLength(10);
    expect(en).toHaveLength(10);
    expect(es.map(({ id, exampleId, requiredScenario, sourcePath, scenarioPath }) => ({ id, exampleId, requiredScenario, sourcePath, scenarioPath }))).toEqual(en.map(({ id, exampleId, requiredScenario, sourcePath, scenarioPath }) => ({ id, exampleId, requiredScenario, sourcePath, scenarioPath })));
    expect(es.map(({ id }) => id)).toEqual(['motor-start-stop-safe', 'pedestrian-crossing-states', 'tank-level-fault-reset', 'conveyor-classification-jam', 'blinky-ladder-timer-feedback', 'motor-plant-feedback', 'edge-counter-pulses', 'scan-cycle-one-scan-memory', 'temporal-assertions-jam-fault', 'conveyor-two-parts-diagnosis']);
    expect(es[1]).toMatchObject({ exampleId: 'pedestrian_crossing', requiredScenario: 'PedestrianCrossing', sourcePath: 'src/PedestrianCrossing.st', scenarioPath: 'tests/pedestrian-crossing.scenario.json', title: 'Cruce peatonal y estados seguros' });
    expect(en[1]).toMatchObject({ title: 'Pedestrian crossing and safe states' });
    for (const lesson of [...es, ...en].filter((lesson) => lesson.id !== 'scan-cycle-one-scan-memory')) expect(lesson.stages).toHaveLength(6);
    expect(es[1]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
    expect(en[1]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[1]?.stages[1]?.checkpoint).toBe('verde+STOP 0 ms; amarillo+STOP 20; rojo+STOP 40; rojo+WALK 60; rojo+STOP 90; verde+STOP 110.');
    expect(en[1]?.stages[1]?.checkpoint).toBe('green+STOP 0 ms; yellow+STOP 20; red+STOP 40; red+WALK 60; red+STOP 90; green+STOP 110.');
    expect(es[1]?.stages[4]?.body).toContain('matriz registrada en Tests');
    expect(en[1]?.stages[4]?.body).toContain('recorded matrix in Tests');
    expect(es[1]?.stages[5]?.body).toContain('NEVER');
    expect(en[1]?.stages[5]?.body).toContain('NEVER');
    for (const lesson of [es[1]!, en[1]!]) expect(lesson.scope).toMatch(/POSIX|host/i);
    expect(es[1]?.scope).toContain('no es evidencia de cruce físico, hardware, HIL ni certificación');
    expect(en[1]?.scope).toContain('not physical crossing, hardware, HIL, or certification evidence');
    expect(es[2]).toMatchObject({ exampleId: 'tank_level', requiredScenario: 'TankLevel', sourcePath: 'src/TankLevel.st', scenarioPath: 'tests/tank-level.scenario.json', title: 'Nivel de tanque, fallas y reset', scope: 'La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de proceso físico, hardware, HIL ni certificación.' });
    expect(en[2]).toMatchObject({ title: 'Tank level, faults, and reset', scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical-process, hardware, HIL, or certification evidence.' });
    expect(es[2]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
    expect(en[2]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[2]?.stages[1]?.checkpoint).toBe('Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.');
    expect(en[2]?.stages[1]?.checkpoint).toBe('Pump ON/Alarm NORMAL 10–60 ms; Pump OFF/Alarm NORMAL 70 ms; OFF/ALARM 80–90; OFF/NORMAL 100–110; OFF/ALARM 120–130; OFF/NORMAL 140–150.');
    for (const name of ['PumpLatched', 'FaultLatched', 'ResetArmed']) expect(es[2]?.stages[0]?.body).toContain(name);
    expect(es[2]?.stages[4]?.body).toContain('80/100/120/140');
    expect(en[2]?.stages[4]?.body).toContain('80/100/120/140');
    expect(es[3]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json', title: 'Cinta de clasificación y atasco seguro', scope: 'La evidencia de Tests es determinística del host nativo POSIX; no es evidencia de cinta física, despeje de atasco, hardware, HIL ni certificación.' });
    expect(en[3]).toMatchObject({ title: 'Conveyor classification and safe jam', scope: 'Tests provide deterministic native POSIX host evidence only; they are not physical conveyor, jam clearance, hardware, HIL, or certification evidence.' });
    expect(es[3]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
    expect(en[3]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[3]?.stages[1]?.checkpoint).toBe('Belt ON 10–40; Diverter ON sólo 30; FaultLamp ON y Belt OFF 50–80. Reset a 60 no libera mientras JamDetected sigue activo.');
    expect(en[3]?.stages[1]?.checkpoint).toBe('Belt ON 10–40; Diverter ON only 30; FaultLamp ON and Belt OFF 50–80. Reset at 60 does not release while JamDetected remains active.');
    for (const name of ['Requested', 'Faulted', 'MetalLatched']) expect(es[3]?.stages[0]?.body).toContain(name);
    expect(es[3]?.stages[4]?.body).toContain('classifier+metal 20, diverter+count=1 a 30, jam 50');
    expect(en[3]?.stages[4]?.body).toContain('classifier+metal 20, diverter+count=1 at 30, jam 50');
    expect(es[3]?.stages[5]?.body).toBe('La assertion NEVER cubre DiverterCommand ON con BeltCommand OFF sólo en este escenario.');
    expect(en[3]?.stages[5]?.body).toBe('The NEVER assertion covers DiverterCommand ON with BeltCommand OFF only in this scenario.');
    expect(es[4]).toMatchObject({ exampleId: 'blinky', requiredScenario: 'BlinkyVisual', sourcePath: 'src/main.ld', scenarioPath: 'tests/blinky-visual.scenario.json', title: 'Ladder, TON y realimentación de salida', scope: 'La evidencia de Tests es del host nativo POSIX; no es evidencia de LED físico, timing de hardware, HIL ni certificación.' });
    expect(en[4]).toMatchObject({ title: 'Ladder, TON, and output feedback', scope: 'Tests provide native POSIX host evidence only; they are not physical LED, hardware timing, HIL, or certification evidence.' });
    expect(es[4]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
    expect(en[4]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[4]?.stages[1]?.checkpoint).toBe('LED OFF habilita TON; BlinkTimer.Q alimenta coil; el escenario exige FALLING entre 10–550 ms y RISING entre 10–1090 ms.');
    expect(en[4]?.stages[1]?.checkpoint).toBe('LED OFF enables TON; BlinkTimer.Q feeds the coil; scenario requires FALLING between 10–550 ms and RISING between 10–1090 ms.');
    for (const value of ['LED_Output', 'BlinkTimer', 'T#500ms']) expect(es[4]?.stages[0]?.body).toContain(value);
    expect(es[5]).toMatchObject({ exampleId: 'motor_plant', requiredScenario: 'MotorPlant', sourcePath: 'src/MotorPlant.st', scenarioPath: 'tests/motor-plant.scenario.json', title: 'Comando, realimentación y velocidad', summary: 'Separá la orden del motor de la confirmación de marcha usando la planta Motor Plant.', scope: 'La evidencia de Tests es determinística del host nativo POSIX y de la planta discreta; no es evidencia de motor físico, hardware, HIL ni certificación.' });
    expect(en[5]).toMatchObject({ title: 'Command, feedback, and speed', summary: 'Separate a motor command from the run confirmation using the Motor Plant.', scope: 'Tests provide deterministic native POSIX host and discrete-plant evidence only; they are not physical-motor, hardware, HIL, or certification evidence.' });
    expect(es[5]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
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
    expect(es[6]).toMatchObject({ exampleId: 'edge_counter', requiredScenario: 'EdgeCounter', sourcePath: 'src/EdgeCounter.st', scenarioPath: 'tests/edge-counter.scenario.json', title: 'Flancos y contador de pulsos', summary: 'Usá R_TRIG y CTU para contar tres pulsos discretos y resetear el umbral.', scope: 'La evidencia de Tests es del host nativo POSIX; no es evidencia de sensor físico, rebote, hardware, HIL ni certificación.' });
    expect(en[6]).toMatchObject({ title: 'Edges and pulse counter', summary: 'Use R_TRIG and CTU to count three discrete pulses and reset the threshold.', scope: 'Tests provide native POSIX host evidence only; they are not physical-sensor, bounce, hardware, HIL, or certification evidence.' });
    expect(es[6]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Editá', 'Ejecutá', 'Observá', 'Reflexioná']);
    expect(en[6]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Edit', 'Run', 'Observe', 'Reflect']);
    expect(es[6]?.stages[0]).toEqual({ title: 'Objetivo', body: 'Ubicá PulseInput, Reset, Edge, Count y CountReached en src/EdgeCounter.st.', checkpoint: 'R_TRIG convierte cada flanco ascendente en un pulso de un scan; CTU cuenta esos pulsos.' });
    expect(en[6]?.stages[0]).toEqual({ title: 'Objective', body: 'Locate PulseInput, Reset, Edge, Count, and CountReached in src/EdgeCounter.st.', checkpoint: 'R_TRIG turns each rising edge into a one-scan pulse; CTU counts those pulses.' });
    expect(es[6]?.stages[1]).toEqual({ title: 'Predecí', body: 'Antes de ejecutar, anticipá cuándo el contador alcanza PV=3.', checkpoint: 'CountReached permanece OFF a 0, 10 y 30 ms; enciende a 50 tras el tercer flanco; vuelve OFF a 70 con Reset.' });
    expect(en[6]?.stages[1]).toEqual({ title: 'Predict', body: 'Before running, predict when the counter reaches PV=3.', checkpoint: 'CountReached stays OFF at 0, 10, and 30 ms; turns ON at 50 after the third edge; returns OFF at 70 with Reset.' });
    expect(es[6]?.stages[4]).toEqual({ title: 'Observá', body: 'Compará los eventos de 10, 30, 50 y 70 ms con la salida CountReached.', checkpoint: 'El tercer pulso alcanza PV=3; Reset domina y devuelve CountReached a OFF.' });
    expect(en[6]?.stages[4]).toEqual({ title: 'Observe', body: 'Compare 10, 30, 50, and 70 ms with CountReached.', checkpoint: 'The third pulse reaches PV=3; Reset dominates and returns CountReached to OFF.' });
    expect(es[6]?.stages[5]).toEqual({ title: 'Reflexioná', body: 'Las assertions AT/RISING/FALLING cubren esta secuencia lógica discreta.', checkpoint: 'No demuestran rebote, pulsos eléctricos, timing de hardware, HIL ni certificación.' });
    expect(en[6]?.stages[5]).toEqual({ title: 'Reflect', body: 'The AT/RISING/FALLING assertions cover this discrete logical sequence.', checkpoint: 'They do not establish bounce, electrical pulses, hardware timing, HIL, or certification.' });
    expect(es[7]).toMatchObject({ exampleId: 'scan_snapshot', requiredScenario: 'ScanSnapshot', sourcePath: 'src/ScanSnapshot.st', scenarioPath: 'tests/scan-snapshot.scenario.json', title: 'Ciclo de scan y memoria de un ciclo', summary: 'Seguí cómo una entrada produce una salida actual y una copia demorada un scan.', scope: 'La evidencia de Tests es del runtime nativo POSIX host con una única tarea de 10 ms; no demuestra timing de target, snapshot bajo interrupciones físicas, rebote eléctrico, HIL ni certificación.' });
    expect(en[7]).toMatchObject({ title: 'Scan cycle and one-scan memory', summary: 'Follow how one input produces the current output and a copy delayed by one scan.', scope: 'Tests provide native POSIX host runtime evidence with one 10 ms task; they do not establish target timing, snapshots under physical interrupts, electrical bounce, HIL, or certification.' });
    expect(es[7]?.stages).toEqual([
      { title: 'Objetivo', body: 'Ubicá Button, Previous, Current, Delayed y RisingPulse en src/ScanSnapshot.st.', checkpoint: 'Previous se actualiza al final del scan.' },
      { title: 'Predecí', body: 'Antes de ejecutar, anticipá los cuatro samples registrados.', checkpoint: '000@0, 101@10, 010@20, 000@30.' },
      { title: 'Editá', body: 'Agregá solamente un comentario explicativo inocuo en src/ScanSnapshot.st. Esta edición no se corrige automáticamente.', checkpoint: 'El comportamiento del programa debe permanecer sin cambios.' },
      { title: 'Ejecutá', body: 'En Tests, elegí el zplc.json guardado y ejecutá únicamente el escenario ScanSnapshot.', checkpoint: 'El escenario requerido se llama ScanSnapshot.' },
      { title: 'Observá', body: 'Compará 10, 20 y 30 ms: RisingPulse dura un scan y Delayed conserva la copia demorada.', checkpoint: 'El pulso aparece a 10 ms; Delayed aparece a 20 ms y vuelve OFF a 30 ms.' },
      { title: 'Evidencia', body: 'AT/RISING/FALLING/NEVER cubren el escenario; los hashes y la traza pertenecen al host.', checkpoint: 'La evidencia registrada es del escenario host ejecutado.' },
      { title: 'Reflexioná', body: 'Actualizar Previous antes rompería el detector de flanco.', checkpoint: 'La memoria debe conservar el valor anterior hasta el final del scan.' },
    ]);
    expect(en[7]?.stages).toEqual([
      { title: 'Objective', body: 'Locate Button, Previous, Current, Delayed, and RisingPulse in src/ScanSnapshot.st.', checkpoint: 'Previous updates at the end of the scan.' },
      { title: 'Predict', body: 'Before running, predict the four recorded samples.', checkpoint: '000@0, 101@10, 010@20, 000@30.' },
      { title: 'Edit', body: 'Add only a harmless explanatory comment in src/ScanSnapshot.st. This edit is not auto-graded.', checkpoint: 'Program behavior must remain unchanged.' },
      { title: 'Run', body: 'In Tests, choose the saved zplc.json and run only the ScanSnapshot scenario.', checkpoint: 'The required scenario is named ScanSnapshot.' },
      { title: 'Observe', body: 'Compare 10, 20, and 30 ms: RisingPulse lasts one scan and Delayed keeps the delayed copy.', checkpoint: 'The pulse appears at 10 ms; Delayed appears at 20 ms and returns OFF at 30 ms.' },
      { title: 'Evidence', body: 'AT/RISING/FALLING/NEVER cover the scenario; hashes and trace belong to the host.', checkpoint: 'Recorded evidence belongs to the executed host scenario.' },
      { title: 'Reflect', body: 'Updating Previous first would break the edge detector.', checkpoint: 'Memory must retain the prior value until the end of the scan.' },
    ]);
    expect(es[8]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'Conveyor01', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-01.scenario.json', title: 'Assertions temporales y falla por atasco', scope: 'La evidencia de Tests es del runtime nativo POSIX host y de la planta discreta; el atasco inyectado no es una falla física, despeje físico, timing de target, HIL ni certificación.' });
    expect(en[8]).toMatchObject({ title: 'Temporal assertions and jam fault', scope: 'Tests provide native POSIX host runtime and discrete-plant evidence only; the injected jam is not a physical fault, physical clearance, target timing, HIL, or certification evidence.' });
    expect(es[8]?.stages.map(({ title }) => title)).toEqual(['Objetivo', 'Predecí', 'Leé el escenario', 'Ejecutá', 'Contrastá', 'Reflexioná']);
    expect(en[8]?.stages.map(({ title }) => title)).toEqual(['Objective', 'Predict', 'Read the scenario', 'Run', 'Compare', 'Reflect']);
    for (const operator of ['AT', 'RISING', 'NEVER', 'WITHIN', 'FOR']) {
      expect(es[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(operator);
      expect(en[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(operator);
    }
    for (const timing of ['0', '10', '20', '50', '80']) {
      expect(es[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(timing);
      expect(en[8]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain(timing);
    }
    expect(es[8]?.stages[1]?.checkpoint).toBe('AT exige BeltCommand, DiverterCommand y FaultLamp OFF a 0 ms y BeltCommand ON a 10 ms.');
    expect(en[8]?.stages[1]?.checkpoint).toBe('AT requires BeltCommand, DiverterCommand, and FaultLamp OFF at 0 ms and BeltCommand ON at 10 ms.');
    expect(es[8]?.stages[2]?.checkpoint).toContain('a más tardar a 30 ms');
    expect(en[8]?.stages[2]?.checkpoint).toContain('by 30 ms');
    expect(es[9]).toMatchObject({ exampleId: 'conveyor_01', requiredScenario: 'ConveyorTwoParts', sourcePath: 'src/Conveyor.st', scenarioPath: 'tests/conveyor-two-parts.scenario.json', title: 'Diagnóstico reproducible: dos piezas, una decisión', scope: 'La evidencia de Tests es del runtime nativo POSIX host con inputs programados por escenario; no es evidencia de sensores ni piezas físicas, timing de target, hardware, HIL ni certificación.' });
    expect(en[9]).toMatchObject({ title: 'Reproducible diagnosis: two parts, one decision', scope: 'Tests provide native POSIX host runtime evidence with scenario-scheduled inputs; they are not physical sensors or parts, target timing, hardware, HIL, or certification evidence.' });
    expect(es[9]?.stages.map(({ title }) => title)).toEqual(['Ubicá', 'Predecí', 'Leé el calendario', 'Ejecutá', 'Diagnosticá', 'Límites']);
    expect(en[9]?.stages.map(({ title }) => title)).toEqual(['Locate', 'Predict', 'Read the schedule', 'Run', 'Diagnose', 'Limits']);
    for (const lesson of [es[9]!, en[9]!]) {
      expect(lesson.stages).toHaveLength(6);
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('AT@30');
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('AT@70');
      expect(lesson.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('NEVER');
    }
    expect(es[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=true');
    expect(es[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=false');
    expect(en[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=true');
    expect(en[9]?.stages.map(({ body, checkpoint }) => `${body} ${checkpoint}`).join(' ')).toContain('Belt=true/Diverter=false');
  });

  it('grades complete recorded scenario evidence generically for all ten lessons', () => {
    for (const lesson of learnLessonCatalog.en) {
      const passed = recordedPresentation(lesson);
      expect(gradeRecordedScenarioLesson(lesson, undefined)).toEqual({ kind: 'not-run' });
      expect(gradeRecordedScenarioLesson(lesson, passed)).toEqual({ kind: 'passed', assertions: 1 });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, kind: 'assertion-failed', diagnostics: [{ code: 'SCENARIO_ASSERTION_FAILED', message: 'failed' }], preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, passed: false, assertions: [{ kind: 'NEVER', passed: false }] }] } })).toEqual({ kind: 'failed', assertions: 1 });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, operation: 'test' })).toEqual({ kind: 'unrelated' });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, preview: { ...passed.preview!, scenarios: [{ ...passed.preview!.scenarios[0]!, id: 'Other' }] } })).toEqual({ kind: 'unrelated' });
      expect(gradeRecordedScenarioLesson(lesson, { ...passed, hasEvidence: false })).toEqual({ kind: 'unavailable' });
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
    for (const grade of [{ kind: 'failed', assertions: 1 }, { kind: 'not-run' }, { kind: 'unavailable' }, { kind: 'unrelated' }] as const) expect(recordLearnMastery(pedestrian.id, grade, mastered, storage(null, (_key, value) => writes.push(value)))).toBe(mastered);
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
});
