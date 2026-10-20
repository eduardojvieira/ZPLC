/** The text of one surface, in English and in Spanish (UX-029, UX-030). Keys `labScene.*`. */
export const labSceneEn = {
  'labScene.active': 'ACTIVE',
  'labScene.clear': 'CLEAR',
  'labScene.detected': 'DETECTED',
  'labScene.motorLabel': 'Motor at {ms} milliseconds: command {command}, running {running}, at speed {atSpeed}, speed {speed} per mille',
  'labScene.conveyorLabel': 'Conveyor at {ms} milliseconds: belt {belt}, diverter {diverter}, fault {fault}, classifier {classifier}, metal {metal}, diverter sensor {diverterSensor}, jam {jam}, classified {count}',
  'labScene.tankLabel': 'Tank at {ms} milliseconds: level {level} per mille, pump {pump}, alarm {alarm}, low {low}, high {high}',
  'labScene.crossingLabel': 'Crossing at {ms} milliseconds: vehicle {vehicle}, pedestrian {pedestrian}, request {request}, phase {phase}',
  'labScene.motorCaption': 'CMD {command} · RUN {running}',
  'labScene.atSpeedCaption': 'AT SPEED {atSpeed} · {speed}‰',
  'labScene.beltCaption': 'BELT {belt} · DIV {diverter} · FAULT {fault}',
  'labScene.sensorsCaption': 'SENSORS C:{classifier} M:{metal} D:{diverterSensor} J:{jam} · COUNT {count}',
  'labScene.levelCaption': 'LEVEL {level}‰ · LOW {low} · HIGH {high}',
  'labScene.pumpCaption': 'PUMP {pump} · ALARM {alarm}',
  'labScene.crossingCaption': 'VEHICLE {vehicle} · PEDESTRIAN {pedestrian} · REQUEST {request} · {phase}',
} as const;

export const labSceneEs: Record<keyof typeof labSceneEn, string> = {
  'labScene.active': 'ACTIVO',
  'labScene.clear': 'LIBRE',
  'labScene.detected': 'DETECTADO',
  'labScene.motorLabel': 'Motor a los {ms} milisegundos: orden {command}, en marcha {running}, a velocidad {atSpeed}, velocidad {speed} por mil',
  'labScene.conveyorLabel': 'Cinta a los {ms} milisegundos: cinta {belt}, desviador {diverter}, falla {fault}, clasificador {classifier}, metal {metal}, sensor del desviador {diverterSensor}, atasco {jam}, clasificadas {count}',
  'labScene.tankLabel': 'Tanque a los {ms} milisegundos: nivel {level} por mil, bomba {pump}, alarma {alarm}, bajo {low}, alto {high}',
  'labScene.crossingLabel': 'Cruce a los {ms} milisegundos: vehículo {vehicle}, peatón {pedestrian}, solicitud {request}, fase {phase}',
  'labScene.motorCaption': 'ORDEN {command} · MARCHA {running}',
  'labScene.atSpeedCaption': 'A VELOCIDAD {atSpeed} · {speed}‰',
  'labScene.beltCaption': 'CINTA {belt} · DESV {diverter} · FALLA {fault}',
  'labScene.sensorsCaption': 'SENSORES C:{classifier} M:{metal} D:{diverterSensor} A:{jam} · CUENTA {count}',
  'labScene.levelCaption': 'NIVEL {level}‰ · BAJO {low} · ALTO {high}',
  'labScene.pumpCaption': 'BOMBA {pump} · ALARMA {alarm}',
  'labScene.crossingCaption': 'VEHÍCULO {vehicle} · PEATÓN {pedestrian} · SOLICITUD {request} · {phase}',
};
