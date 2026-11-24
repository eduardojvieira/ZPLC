/**
 * What a part of the plant is in a real plant, and what each of its signals means, in English and Spanish: the text of the machine
 * pages of the plant lessons (signal-table.ts, machine-images.ts). The part catalogue (src/plant/core/parts) names each part and
 * documents how the simulation models it; it has no place for this text, so it lives here until the catalogue gets one.
 *
 * Spanish follows docs/docs/learn/glossary.md: usted, "cinta" for the belt, signal values as the program writes them.
 */
export type Locale = 'en' | 'es';
export type Text = Record<Locale, string>;
export interface PartText {
  /** One short line: what the part is in a real plant. */
  plant: Text;
  /** What each signal the plant map can wire means to the program, by the signal's name on the part. */
  signals: Record<string, Text>;
}

const t = (en: string, es: string): Text => ({ en, es });

// The axes and the gripper of the handling units (pick-place, gantry, layer palletizer).
const AXES: Record<string, Text> = {
  xAtMin: t('TRUE when the X axis is at its start limit.', 'TRUE cuando el eje X está en su límite inicial.'),
  xAtMax: t('TRUE when the X axis is at its end limit.', 'TRUE cuando el eje X está en su límite final.'),
  yAtMin: t('TRUE when the Y axis (up) is at its lowest.', 'TRUE cuando el eje Y (vertical) está en su punto más bajo.'),
  yAtMax: t('TRUE when the Y axis (up) is at its highest.', 'TRUE cuando el eje Y (vertical) está en su punto más alto.'),
  xPlus: t('TRUE moves the X axis forward while it is held.', 'TRUE mueve el eje X hacia adelante mientras se mantiene.'),
  xMinus: t('TRUE moves the X axis back while it is held.', 'TRUE mueve el eje X hacia atrás mientras se mantiene.'),
  yPlus: t('TRUE moves the Y axis up while it is held.', 'TRUE sube el eje Y mientras se mantiene.'),
  yMinus: t('TRUE moves the Y axis down while it is held.', 'TRUE baja el eje Y mientras se mantiene.'),
  xSet: t('The position the X axis must go to.', 'La posición a la que debe ir el eje X.'),
  ySet: t('The position the Y axis must go to.', 'La posición a la que debe ir el eje Y.'),
  zSet: t('The position the Z axis must go to.', 'La posición a la que debe ir el eje Z.'),
  xPos: t('Where the X axis is now.', 'Dónde está ahora el eje X.'),
  yPos: t('Where the Y axis is now.', 'Dónde está ahora el eje Y.'),
  zPos: t('Where the Z axis is now.', 'Dónde está ahora el eje Z.'),
  grip: t('TRUE closes the gripper (vacuum on, or jaws closed).', 'TRUE cierra la pinza (vacío activado, o mordazas cerradas).'),
  gripped: t('TRUE while the gripper holds an item.', 'TRUE mientras la pinza sostiene una pieza.'),
};

export const PART_TEXT: Readonly<Record<string, PartText>> = {
  belt: {
    plant: t(
      'A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.',
      'Una cinta movida por un motor que lleva la mercancía a lo largo de una línea, la base de casi toda línea de embalaje o clasificación.',
    ),
    signals: { run: t('TRUE runs the belt forward.', 'TRUE hace avanzar la cinta.') },
  },
  emitter: {
    plant: t(
      'Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item.',
      'Representa lo que alimenta la línea: la máquina anterior, un operario o un cargador que suelta una pieza.',
    ),
    signals: { emit: t('Each rising edge releases one item onto the line.', 'Cada flanco ascendente suelta una pieza en la línea.') },
  },
  remover: {
    plant: t(
      'Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.',
      'Representa lo que retira las piezas al final de la línea: la máquina siguiente, un contenedor o un operario.',
    ),
    signals: {},
  },
  box: {
    plant: t('A carton or a tote: the goods the line handles.', 'Una caja de cartón o una cubeta: la mercancía que mueve la línea.'),
    signals: {},
  },
  pallet: {
    plant: t(
      'A wooden pallet that carries a load through the plant and onto a truck.',
      'Una tarima de madera que lleva una carga por la planta y hasta un camión.',
    ),
    signals: {},
  },
  'sensor-diffuse': {
    plant: t(
      'A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.',
      'Un sensor fotoeléctrico que emite luz y la ve rebotar en un objeto que tiene delante.',
    ),
    signals: { detect: t('TRUE while an object is in the beam.', 'TRUE mientras hay un objeto en el haz.') },
  },
  'sensor-colour': {
    plant: t(
      'An optical sensor taught one colour: it tells whether the object in front of it has that colour.',
      'Un sensor óptico al que se le enseña un color: indica si el objeto que tiene delante es de ese color.',
    ),
    signals: {
      detect: t('TRUE while an object is in the beam.', 'TRUE mientras hay un objeto en el haz.'),
      match: t('TRUE while the object in the beam has the taught colour.', 'TRUE mientras el objeto del haz tiene el color enseñado.'),
    },
  },
  'light-array': {
    plant: t(
      'A light curtain: a column of beams across the line that measures how tall an object is.',
      'Una cortina de luz: una columna de haces que cruza la línea y mide qué altura tiene un objeto.',
    ),
    signals: {
      detect: t('TRUE while any beam is broken.', 'TRUE mientras algún haz está cortado.'),
      height: t(
        'The height of the top of the item in the curtain; 0 when no beam is broken.',
        'La altura de la parte superior de la pieza en la cortina; 0 cuando ningún haz está cortado.',
      ),
    },
  },
  'vision-sensor': {
    plant: t(
      'A camera with its own software that reads a code printed on the item.',
      'Una cámara con software propio que lee un código impreso en la pieza.',
    ),
    signals: {
      detect: t('TRUE while an item is in the field of view.', 'TRUE mientras hay una pieza en el campo de visión.'),
      code: t('The code read from the item; 0 when there is none.', 'El código leído de la pieza; 0 cuando no hay ninguno.'),
    },
  },
  scale: {
    plant: t(
      'A weighing platform in the line, like a checkweigher, that reports the weight of what lies on it.',
      'Una plataforma de pesaje en la línea, como una controladora de peso, que informa el peso de lo que tiene encima.',
    ),
    signals: {
      stable: t(
        'TRUE once the load has been at rest long enough to be weighed.',
        'TRUE cuando la carga estuvo en reposo el tiempo suficiente para pesarla.',
      ),
      weight: t('The weight on the platform; 0 until it is stable.', 'El peso sobre la plataforma; 0 hasta que es estable.'),
    },
  },
  'diverter-arm': {
    plant: t(
      'A swinging arm over the belt that steers items off to a side line.',
      'Un brazo que gira sobre la cinta y desvía las piezas hacia una línea lateral.',
    ),
    signals: {
      divert: t(
        'TRUE swings the arm across the belt; FALSE brings it back to rest.',
        'TRUE gira el brazo sobre la cinta; FALSE lo devuelve al reposo.',
      ),
    },
  },
  pusher: {
    plant: t(
      'A pneumatic cylinder with a plate that pushes an item sideways off the belt.',
      'Un cilindro neumático con una placa que empuja una pieza hacia un lado de la cinta.',
    ),
    signals: {
      extend: t('TRUE drives the plate out across the belt; FALSE pulls it back.', 'TRUE saca la placa sobre la cinta; FALSE la retrae.'),
      extended: t('TRUE when the plate is fully out.', 'TRUE cuando la placa está totalmente afuera.'),
      retracted: t('TRUE when the plate is fully back.', 'TRUE cuando la placa está totalmente retraída.'),
    },
  },
  'stop-blade': {
    plant: t(
      'A plate that rises across the belt to hold items back until they are let through.',
      'Una placa que se eleva sobre la cinta para retener las piezas hasta dejarlas pasar.',
    ),
    signals: { extend: t('TRUE raises the blade across the belt; FALSE lowers it.', 'TRUE eleva el tope sobre la cinta; FALSE lo baja.') },
  },
  'machining-centre': {
    plant: t(
      'An enclosed machine tool that cuts a raw part into a finished one, with doors that close during the cycle.',
      'Una máquina herramienta cerrada que mecaniza una pieza en bruto hasta terminarla, con puertas que se cierran durante el ciclo.',
    ),
    signals: {
      feed: t(
        "TRUE runs the machine's own belt, into the chamber and out of it.",
        'TRUE hace avanzar la cinta propia de la máquina, hacia la cámara y fuera de ella.',
      ),
      start: t(
        'A rising edge while ready is TRUE closes the doors and starts a cycle.',
        'Un flanco ascendente con ready en TRUE cierra las puertas e inicia un ciclo.',
      ),
      ready: t(
        'TRUE when exactly one raw part rests in the chamber: a cycle can start.',
        'TRUE cuando hay exactamente una pieza en bruto en reposo en la cámara: puede iniciarse un ciclo.',
      ),
      done: t(
        'TRUE from the end of a cycle until the finished part leaves the chamber.',
        'TRUE desde el fin de un ciclo hasta que la pieza terminada sale de la cámara.',
      ),
    },
  },
  'push-button': {
    plant: t(
      'A button on the operator panel that is pressed only while a finger holds it.',
      'Un pulsador del panel del operador, presionado solo mientras un dedo lo mantiene.',
    ),
    signals: { pressed: t('TRUE while the button is held down.', 'TRUE mientras el pulsador se mantiene presionado.') },
  },
  'emergency-stop': {
    plant: t(
      'The red mushroom button that stops the machine; it stays in until someone twists it to release it.',
      'El botón rojo tipo hongo que detiene la máquina; queda hundido hasta que alguien lo gira para liberarlo.',
    ),
    signals: {
      ok: t(
        'TRUE while the button is released (its normally closed contact); FALSE when it is pushed or its wire is cut.',
        'TRUE mientras el botón está liberado (su contacto normalmente cerrado); FALSE si está presionado o su cable está cortado.',
      ),
    },
  },
  'stack-light': {
    plant: t(
      'A tower of coloured lamps that shows from afar what the machine is doing.',
      'Una torre de lámparas de colores que muestra a distancia qué hace la máquina.',
    ),
    signals: {
      green: t('TRUE lights the green lamp.', 'TRUE enciende la lámpara verde.'),
      amber: t('TRUE lights the amber lamp.', 'TRUE enciende la lámpara ámbar.'),
      red: t('TRUE lights the red lamp.', 'TRUE enciende la lámpara roja.'),
    },
  },
  'indicator-light': {
    plant: t(
      'A pilot lamp on the operator panel that shows one state.',
      'Un piloto luminoso del panel del operador que muestra un estado.',
    ),
    signals: { lit: t('TRUE switches the lamp on.', 'TRUE enciende el piloto.') },
  },
  potentiometer: {
    plant: t(
      'A knob on the operator panel that sets a value, such as a speed or a setpoint.',
      'Una perilla del panel del operador que fija un valor, como una velocidad o una consigna.',
    ),
    signals: { value: t('Where the knob is turned to.', 'La posición a la que está girada la perilla.') },
  },
  'numeric-display': {
    plant: t(
      'A small display on the operator panel that shows a number the program sends.',
      'Un pequeño indicador del panel del operador que muestra un número que envía el programa.',
    ),
    signals: { value: t('The number to show.', 'El número que se muestra.') },
  },
  'pick-place': {
    plant: t(
      'A two-axis handling unit that picks an item up with a gripper and sets it down somewhere else.',
      'Una unidad de manipulación de dos ejes que toma una pieza con una pinza y la deja en otro lugar.',
    ),
    signals: AXES,
  },
  gantry: {
    plant: t(
      'A three-axis handling robot on a frame over the work area that moves a gripper in X, Y and Z.',
      'Un robot de manipulación de tres ejes sobre un pórtico, que mueve una pinza en X, Y y Z.',
    ),
    signals: AXES,
  },
  'layer-palletizer': {
    plant: t(
      'A machine that squares boxes into a layer and sets the whole layer on a pallet.',
      'Una máquina que ordena cajas en una capa y deja la capa entera sobre una tarima.',
    ),
    signals: {
      ...AXES,
      square: t('TRUE closes the squaring pusher on the layer.', 'TRUE cierra el empujador que escuadra la capa.'),
      squared: t('TRUE when the squaring pusher is closed.', 'TRUE cuando el empujador de escuadrado está cerrado.'),
      layerReady: t(
        'TRUE when a full layer of boxes rests in the forming zone.',
        'TRUE cuando una capa completa de cajas reposa en la zona de formación.',
      ),
    },
  },
  'chain-transfer': {
    plant: t(
      'A section of the line whose chains rise between the rollers to move an item sideways onto another line.',
      'Un tramo de la línea cuyas cadenas suben entre los rodillos para mover una pieza de lado hacia otra línea.',
    ),
    signals: {
      run: t('TRUE moves items forward along the line (chains down).', 'TRUE mueve las piezas hacia adelante en la línea (cadenas abajo).'),
      lift: t('TRUE raises the chains; FALSE lowers them.', 'TRUE sube las cadenas; FALSE las baja.'),
      moveRight: t(
        'TRUE moves items sideways to the right (chains up).',
        'TRUE mueve las piezas de lado hacia la derecha (cadenas arriba).',
      ),
      moveLeft: t(
        'TRUE moves items sideways to the left (chains up).',
        'TRUE mueve las piezas de lado hacia la izquierda (cadenas arriba).',
      ),
      raised: t('TRUE when the chains are fully up.', 'TRUE cuando las cadenas están totalmente arriba.'),
      lowered: t('TRUE when the chains are fully down.', 'TRUE cuando las cadenas están totalmente abajo.'),
    },
  },
  turntable: {
    plant: t(
      'A rotating platform that turns an item towards one of several lines.',
      'Una plataforma giratoria que orienta una pieza hacia una de varias líneas.',
    ),
    signals: {
      run: t("TRUE runs the platform's surface forward.", 'TRUE hace avanzar la superficie de la plataforma.'),
      toLeft: t(
        'TRUE turns the platform to the left line; with neither command it returns to the centre.',
        'TRUE gira la plataforma hacia la línea izquierda; sin ninguna de las dos órdenes vuelve al centro.',
      ),
      toRight: t(
        'TRUE turns the platform to the right line; with neither command it returns to the centre.',
        'TRUE gira la plataforma hacia la línea derecha; sin ninguna de las dos órdenes vuelve al centro.',
      ),
      atCentre: t('TRUE when the platform faces the centre line.', 'TRUE cuando la plataforma apunta a la línea central.'),
      atLeft: t('TRUE when the platform faces the left line.', 'TRUE cuando la plataforma apunta a la línea izquierda.'),
      atRight: t('TRUE when the platform faces the right line.', 'TRUE cuando la plataforma apunta a la línea derecha.'),
    },
  },
  lift: {
    plant: t(
      'A vertical conveyor that carries an item between floors or levels of a line.',
      'Un transportador vertical que lleva una pieza entre pisos o niveles de una línea.',
    ),
    signals: {
      up: t('TRUE moves the platform up.', 'TRUE sube la plataforma.'),
      down: t('TRUE moves the platform down.', 'TRUE baja la plataforma.'),
      run: t("TRUE runs the platform's belt forward.", 'TRUE hace avanzar la cinta de la plataforma.'),
      atLevel1: t('TRUE when the platform stands at level 1.', 'TRUE cuando la plataforma está detenida en el nivel 1.'),
      atLevel2: t('TRUE when the platform stands at level 2.', 'TRUE cuando la plataforma está detenida en el nivel 2.'),
      atLevel3: t('TRUE when the platform stands at level 3.', 'TRUE cuando la plataforma está detenida en el nivel 3.'),
      atLevel4: t('TRUE when the platform stands at level 4.', 'TRUE cuando la plataforma está detenida en el nivel 4.'),
    },
  },
  'stacker-crane': {
    plant: t(
      'The crane of an automated warehouse: it runs along an aisle, stores boxes in the cells of a rack and takes them out.',
      'La grúa de un almacén automático: recorre un pasillo, guarda cajas en las celdas de un estante y las retira.',
    ),
    signals: {
      bay: t('The rack column to travel to (0 is the dock).', 'La columna del estante a la que debe ir (0 es el muelle).'),
      level: t('The rack level to travel to (0 is the dock).', 'El nivel del estante al que debe ir (0 es el muelle).'),
      inPosition: t(
        'TRUE when the crane stands still at the column and level asked for.',
        'TRUE cuando la grúa está quieta en la columna y el nivel pedidos.',
      ),
      raise: t(
        'TRUE lifts the fork a little, to pick a box up or set it down.',
        'TRUE eleva un poco la horquilla, para levantar o apoyar una caja.',
      ),
      raised: t('TRUE when the fork is lifted.', 'TRUE cuando la horquilla está elevada.'),
      forkLeft: t(
        'TRUE extends the fork to the left while it is held.',
        'TRUE extiende la horquilla hacia la izquierda mientras se mantiene.',
      ),
      forkRight: t(
        'TRUE extends the fork to the right while it is held.',
        'TRUE extiende la horquilla hacia la derecha mientras se mantiene.',
      ),
      forkCentre: t('TRUE when the fork is back in the centre.', 'TRUE cuando la horquilla está de vuelta en el centro.'),
      forkAtLeft: t('TRUE when the fork is fully out to the left.', 'TRUE cuando la horquilla está totalmente extendida a la izquierda.'),
      forkAtRight: t('TRUE when the fork is fully out to the right.', 'TRUE cuando la horquilla está totalmente extendida a la derecha.'),
      beltRight: t(
        'TRUE runs the belt on the fork towards the rack side.',
        'TRUE hace avanzar la cinta de la horquilla hacia el lado del estante.',
      ),
      loaded: t('TRUE while a box rests on the fork.', 'TRUE mientras una caja reposa en la horquilla.'),
    },
  },
  tank: {
    plant: t(
      'A process tank filled through an inlet valve and emptied through an outlet valve, with instruments that measure its level.',
      'Un tanque de proceso que se llena por una válvula de entrada y se vacía por una de salida, con instrumentos que miden su nivel.',
    ),
    signals: {
      fill: t(
        'The inlet valve: open or closed (BOOL), or how far it is open (REAL).',
        'La válvula de entrada: abierta o cerrada (BOOL), o cuánto está abierta (REAL).',
      ),
      drain: t(
        'The outlet valve: open or closed (BOOL), or how far it is open (REAL).',
        'La válvula de salida: abierta o cerrada (BOOL), o cuánto está abierta (REAL).',
      ),
      level: t('The level of the liquid in the tank.', 'El nivel del líquido en el tanque.'),
      levelLow: t('TRUE while the level is at the low mark or below it.', 'TRUE mientras el nivel está en la marca baja o por debajo.'),
      levelHigh: t('TRUE while the level is at the high mark or above it.', 'TRUE mientras el nivel está en la marca alta o por encima.'),
    },
  },
};
