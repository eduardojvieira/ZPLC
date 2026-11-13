/** The text of the plant I/O mode, in English and in Spanish. Keys `plantIo.*` and the command title (C-M6-4, LNK-008, LNK-012). */
export const plantBoardEn = {
  'command.online.feedBoardFromPlant': 'Feed the board from the plant',
  'plantIo.unsupported.firmware':
    'This firmware speaks the text shell only, so it cannot be fed from the plant. Update the firmware to a version with plant I/O ' +
    'and connect again, or run the scene in simulation.',
  'plantIo.unsupported.reason.noCapability':
    'This firmware does not offer plant I/O. Update the firmware to a version that does, or run the scene in simulation.',
  'plantIo.exit.CLOSED': 'Plant I/O mode ended: you closed it.',
  'plantIo.exit.TIMEOUT': 'Plant I/O mode ended: the board received no frame in time and returned its outputs to the program.',
  'plantIo.exit.SESSION_END': 'Plant I/O mode ended: the session on the board ended.',
  'plantIo.exit.LINK_LOST': 'Plant I/O mode ended: the connection to the board was lost.',
  'plantIo.exit.RUN_CONTROL': 'Plant I/O mode ended: the program was stopped, paused or reset.',
  'plantIo.exit.FAULT': 'Plant I/O mode ended: the board reported a fault.',
  'plantIo.exit.PROTOCOL': 'Plant I/O mode ended: the board rejected a frame that did not follow the protocol.',
  'plantIo.warn.pulse':
    'The shortest pulse of this scene is {sceneMs} ms, but the link can leave {worstGapMs} ms between two frames with a scan of ' +
    '{scanMs} ms. A pulse can be missed on this connection.',
  'plantIo.confirm.body':
    'The board will read its inputs from the simulated plant and not from its terminals, until you close the mode or the link ends. ' +
    'Check that nothing connected to its outputs can cause harm.',
} as const;

export const plantBoardEs = {
  'command.online.feedBoardFromPlant': 'Alimentar la placa desde la planta',
  'plantIo.unsupported.firmware':
    'Este firmware solo habla el shell de texto, por lo que no se puede alimentar desde la planta. Actualice el firmware a una versión ' +
    'con E/S de planta y vuelva a conectar, o ejecute la escena en simulación.',
  'plantIo.unsupported.reason.noCapability':
    'Este firmware no ofrece E/S de planta. Actualice el firmware a una versión que la ofrezca, o ejecute la escena en simulación.',
  'plantIo.exit.CLOSED': 'El modo de E/S de planta terminó: usted lo cerró.',
  'plantIo.exit.TIMEOUT': 'El modo de E/S de planta terminó: la placa no recibió ningún frame a tiempo y devolvió sus salidas al programa.',
  'plantIo.exit.SESSION_END': 'El modo de E/S de planta terminó: terminó la sesión en la placa.',
  'plantIo.exit.LINK_LOST': 'El modo de E/S de planta terminó: se perdió la conexión con la placa.',
  'plantIo.exit.RUN_CONTROL': 'El modo de E/S de planta terminó: el programa se detuvo, se pausó o se reinició.',
  'plantIo.exit.FAULT': 'El modo de E/S de planta terminó: la placa informó de un fallo.',
  'plantIo.exit.PROTOCOL': 'El modo de E/S de planta terminó: la placa rechazó un frame que no cumplía el protocolo.',
  'plantIo.warn.pulse':
    'El pulso más corto de esta escena es de {sceneMs} ms, pero el enlace puede dejar {worstGapMs} ms entre dos frames con un ciclo de ' +
    '{scanMs} ms. En esta conexión se puede perder un pulso.',
  'plantIo.confirm.body':
    'La placa leerá sus entradas de la planta simulada y no de sus terminales, hasta que cierre el modo o termine el enlace. ' +
    'Compruebe que nada conectado a sus salidas pueda causar daño.',
} as const;
