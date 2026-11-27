/** Text of milestone U3 of spec 013 for the I/O mode (plan-u3.md, Task P8). */
export const u3IoModeEn = {
  'status.ioMode.label': 'Plant I/O mode',
  'status.ioMode.starting': 'Plant I/O mode starting',
  'status.ioMode.mirroring': 'Mirroring on',
  'status.ioMode.latency': 'Plant response time',
  'status.ioMode.latencyValue': '{last} ms last, {worst} ms worst',
  'status.ioMode.latencyNone': 'Not measured yet',
  'plant.ioMode.dialog.title': 'Feed the board from the plant?',
  'plant.ioMode.dialog.description':
    "The board's outputs are held in their safe state while the plant feeds its inputs. Mirroring is off until you turn it on.",
  'plant.ioMode.confirm': 'Feed the board',
  'plant.ioMode.cancel': 'Cancel',
  'plant.ioMode.mirror': 'Mirror the outputs on the board',
  'plant.ioMode.stop': 'Stop feeding the board',
  'plant.ioMode.failed': 'Plant I/O mode is not running: {reason}.',
  'plant.ioMode.exit': 'the board left the mode ({reason})',
  'plant.ioMode.noPort': 'no board is connected',
  'plant.ioMode.failedStaysBoard': 'The board stays as it was.',
} as const;
export const u3IoModeEs: Record<keyof typeof u3IoModeEn, string> = {
  'status.ioMode.label': 'Modo E/S de planta',
  'status.ioMode.starting': 'Iniciando el modo E/S de planta',
  'status.ioMode.mirroring': 'Réplica de salidas activa',
  'status.ioMode.latency': 'Tiempo de respuesta de la planta',
  'status.ioMode.latencyValue': '{last} ms la última, {worst} ms la peor',
  'status.ioMode.latencyNone': 'Aún sin medir',
  'plant.ioMode.dialog.title': '¿Alimentar la placa desde la planta?',
  'plant.ioMode.dialog.description':
    'Las salidas de la placa quedan retenidas en su estado seguro mientras la planta alimenta sus entradas. La réplica de las salidas queda desactivada hasta que usted la active.',
  'plant.ioMode.confirm': 'Alimentar la placa',
  'plant.ioMode.cancel': 'Cancelar',
  'plant.ioMode.mirror': 'Replicar las salidas en la placa',
  'plant.ioMode.stop': 'Dejar de alimentar la placa',
  'plant.ioMode.failed': 'El modo E/S de planta no está en marcha: {reason}.',
  'plant.ioMode.exit': 'la placa salió del modo ({reason})',
  'plant.ioMode.noPort': 'no hay una placa conectada',
  'plant.ioMode.failedStaysBoard': 'La placa queda como estaba.',
};
