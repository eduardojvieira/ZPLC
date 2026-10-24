import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// The text of the landing page, in English and in Spanish. Every claim here is backed by a file of the repository; the list
// is in docs/design/content-outline.md. tools/docs/check_capability_claims.ts and tools/ci/product-name.ts read this file.
// A span between backticks is a literal identifier and is set in code.

const releasesUrl = 'https://github.com/eduardojvieira/ZPLC/releases';
const repositoryUrl = 'https://github.com/eduardojvieira/ZPLC';
const boardReportUrl = 'https://github.com/eduardojvieira/ZPLC/issues/new?template=board_report.yml';

const languageIds = ['st', 'il', 'ld', 'fbd', 'sfc'];

// The groups of the hardware abstraction layer (firmware/lib/zplc_core/include/zplc_hal.h, grouped as in
// docs/docs/runtime/port-interface.md), with the number of functions of each. The last group is optional: the portable core
// does not call it. The words of each terminal are in the locales below, in the same order.
const halGroups = [
  { key: 'clock', size: 2 },
  { key: 'io', size: 6 },
  { key: 'storage', size: 3 },
  { key: 'locks', size: 4 },
  { key: 'life', size: 3 },
  { key: 'network', size: 2, optional: true },
];

// The modules of the course (packages/zplc-ide/lessons/*/lesson.json: `module` and `level`; titles from
// docs/docs/learn/course-outline.md). Modules 0 to 3 are foundation, 4 to 7 intermediate, 8 to 11 advanced.
const moduleLevels = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];

// The simulated plants of the course (LESSON_PLANTS in packages/zplc-ide/src/learn/lessonPackage.ts) and the generated
// illustration of each (docs/static/img/generated/README.md).
const plantIds = [
  { id: 'G1', key: 'tank' },
  { id: 'G2', key: 'conveyor' },
  { id: 'G3', key: 'motor' },
  { id: 'G4', key: 'crossing' },
];

const landingPageContent = {
  en: {
    home: {
      metaTitle: 'The open-source PLC for the microcontroller you choose',
      metaDescription:
        'ZPLC is an open-source IEC 61131-3 PLC: program it in five languages, simulate and debug it on your computer, build ' +
        'its portable runtime for your board, and learn PLC programming with the course inside the application.',
    },
    hero: {
      title: 'The open-source PLC for the microcontroller you choose.',
      lead:
        'Program it in the five IEC 61131-3 languages, simulate and debug it on your computer, then build the same runtime for ' +
        'your board. Free and open source.',
      artAlt:
        'Illustration: a ladder rung drawn as a schematic, wired to the terminals of a generic controller module on a DIN rail; ' +
        'the path to one output is highlighted.',
    },
    paths: {
      label: 'Two ways to start',
      build: {
        title: 'Build a controller',
        text: 'Program, simulate and debug in the ZPLC application, then build the runtime for your board.',
        action: 'Download ZPLC',
        note: 'For Windows, macOS and Linux.',
        more: 'Get started',
      },
      learn: {
        title: 'Learn PLC programming',
        text: 'A free course of 33 lessons inside the same application. ZPLC checks your program in every lesson.',
        action: 'Start learning',
        note: 'In English and Spanish.',
        more: 'For educators',
      },
    },
    portability: {
      title: 'Write the program once. Choose the hardware.',
      lead:
        'Your program runs on the same ZPLC runtime everywhere: on boards with Zephyr RTOS, on the FreeRTOS port and in the ' +
        'simulator on your computer. If your board is not on the list yet, you can bring it.',
      wiring: {
        label: 'One program, one runtime, three platforms',
        program: { name: 'Your program', text: 'ST · IL · LD · FBD · SFC' },
        runtime: { name: 'ZPLC runtime', text: 'The same core on every platform.' },
      },
      platforms: [
        {
          name: 'Zephyr RTOS',
          text: 'Seven board profiles with RP2040, STM32 and ESP32-S3 chips, from serial boards to Ethernet and Wi-Fi.',
          to: '/docs/reference/boards',
        },
        { name: 'FreeRTOS', text: 'A second RTOS port, checked by the port conformance suite in CI.', to: '/docs/runtime/port-interface' },
        {
          name: 'Your computer',
          text: 'The simulator of the ZPLC application, built for Windows, macOS and Linux.',
          to: '/docs/guides/simulate-and-debug',
        },
      ],
      port: {
        title: 'Bring your own microcontroller',
        text:
          'A new port implements the 18 functions of the hardware abstraction layer. The port conformance suite then checks every ' +
          'instruction, the scheduler, the I/O and the storage on it.',
      },
      links: [
        { label: 'Port to a board', to: '/docs/guides/port-to-a-board' },
        { label: 'Port interface', to: '/docs/runtime/port-interface' },
      ],
      strip: {
        title: 'Hardware abstraction layer',
        count: '18 functions, 2 optional',
        groups: {
          clock: { label: 'Clock', terminals: ['tick', 'sleep'] },
          io: {
            label: 'Inputs and outputs',
            terminals: ['digital in', 'digital out', 'analog in', 'analog out', 'I/O table', 'channel count'],
          },
          storage: { label: 'Storage', terminals: ['save', 'load', 'delete'] },
          locks: { label: 'Locks', terminals: ['create', 'lock', 'unlock', 'destroy'] },
          life: { label: 'Log and life cycle', terminals: ['log', 'start', 'shut down'] },
          network: { label: 'Network, optional', terminals: ['start network', 'IP address'] },
        },
      },
    },
    boards: {
      title: 'Seven boards to start from',
      lead:
        'Board profiles for RP2040, STM32 and ESP32-S3 chips, from serial boards to Ethernet and Wi-Fi. Each one builds on every ' +
        'change and fits its flash and RAM budget. Two of them are the learner boards of the course.',
      artAlt: 'Illustration: generic microcontroller boards of different sizes on one DIN rail, wired to one terminal block.',
      columns: { board: 'Board', target: 'Zephyr target', network: 'Network' },
      learner: 'Course board',
      report: 'Using ZPLC on a board of your own? Tell the project what happened, with the image you flashed.',
      links: [
        { label: 'All boards', to: '/docs/reference/boards' },
        { label: 'Report your board', href: boardReportUrl },
      ],
    },
    languages: {
      title: 'Five IEC 61131-3 languages, an editor for each',
      lead:
        'Draw ladder rungs, wire function blocks, chart a sequence, or write Structured Text and Instruction List. Each language ' +
        'has its own editor, and all five compile for the same runtime.',
      tabsLabel: 'IEC 61131-3 languages',
      features: [
        {
          title: 'Completion and navigation',
          text: 'Structured Text gets completion, go to definition, find references and rename across the whole project.',
        },
        { title: 'Diagrams from the keyboard', text: 'Rungs, blocks and steps can be placed and wired without the mouse.' },
        { title: 'One command palette', text: 'Every command of the application is a search away, with Ctrl+Shift+P.' },
      ],
      items: [
        {
          code: 'ST',
          name: 'Structured Text',
          text: 'A text editor for Structured Text. While the program runs, each variable shows its value beside its line.',
          alt: 'The Structured Text editor of ZPLC with the Blinky example.',
          reference: 'Structured Text reference',
        },
        {
          code: 'IL',
          name: 'Instruction List',
          text: 'Instruction List in the same text editor, with breakpoints on a line and values that you can watch and force.',
          alt: 'The Instruction List editor of ZPLC with the Blinky example.',
          reference: 'Instruction List reference',
        },
        {
          code: 'LD',
          name: 'Ladder Diagram',
          text: 'Rungs built from the toolbox or from the keyboard alone, with the values of the rung shown while the program runs.',
          alt: 'The Ladder Diagram editor of ZPLC with the Blinky example: four rungs and a toolbox of contacts and coils.',
          reference: 'Ladder Diagram reference',
        },
        {
          code: 'FBD',
          name: 'Function Block Diagram',
          text: 'Blocks placed and wired on a canvas, also from the keyboard, with online values while the program runs.',
          alt: 'The Function Block Diagram editor of ZPLC with the Blinky example: two timers and logic gates.',
          reference: 'Function Block Diagram reference',
        },
        {
          code: 'SFC',
          name: 'Sequential Function Chart',
          text: 'Steps, transitions and actions on a chart, edited from the keyboard, with the online state of the chart while it runs.',
          alt: 'The Sequential Function Chart editor of ZPLC with the Blinky example.',
          reference: 'Sequential Function Chart reference',
        },
      ],
    },
    debug: {
      title: 'Simulate and debug before you wire anything',
      lead:
        'The simulator is the ZPLC runtime itself, built for your computer and bundled with the application. Run your program, ' +
        'stop it, step it and watch every value, with no board on the desk.',
      shotAlt:
        'Two details of the ZPLC application running the motor lesson in the simulator: the code with its live values, and the ' +
        'Live I/O faceplate with a switch and a push button for each input.',
      caption: 'The motor lesson in the simulator: live values on the code, and the Live I/O faceplate under it.',
      rungs: [
        {
          title: 'Breakpoints in every language',
          text:
            'Stop on a line of Structured Text or Instruction List, a ladder rung, a function block or a step of a chart, and read ' +
            'the values of that scan.',
          link: 'Simulate and debug',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'One scan at a time',
          text: 'Pause between scans, step one cycle, and resume where the program stopped.',
          link: 'Pause, step and resume',
          to: '/docs/ide/features#pause-resume-step-and-stop',
          timing: true,
        },
        {
          title: 'Watch and force',
          text:
            'Watch any variable in decimal, hexadecimal, binary or as a time. A forced value stays marked as forced until you ' +
            'release it.',
          link: 'Force a value',
          to: '/docs/guides/force-values',
        },
        {
          title: 'A live I/O faceplate',
          text:
            'Every input of the program gets a switch, a push button or a slider under its own name, and the change reaches the ' +
            'program at the next scan.',
          link: 'Live I/O',
          to: '/docs/ide/features#live-io',
        },
        {
          title: 'Scenario tests',
          text: 'Write the inputs over time and the outputs you expect, then run them in the Tests tab or with `zplc-cli` in a CI job.',
          link: 'Scenario tests',
          to: '/docs/guides/scenario-tests',
        },
      ],
      timing: {
        caption: 'One scan: read the inputs, run the tasks, write the outputs. Not to scale.',
        rows: ['Read inputs', 'Run tasks', 'Write outputs'],
      },
    },
    learn: {
      title: 'Learn PLC programming without buying a PLC',
      lead:
        'A free course of 33 lessons in 12 modules, from the scan cycle to a small machine, in English and Spanish. ZPLC checks ' +
        'your program in every lesson and tells you what to fix.',
      facts: [
        {
          title: 'Feedback on every attempt',
          text:
            'Check runs your saved program against the scenario of the lesson and lists each assertion that failed, with the ' +
            'time, the value expected and the value seen.',
        },
        {
          title: 'Simulator first, board when you are ready',
          text:
            'All lessons but one run in the simulator, so you need no hardware. 21 of them have a track for a learner board, ' +
            'with the wiring as a diagram and a pin map.',
        },
        {
          title: 'Four machines to drive',
          text: 'A tank, a conveyor, a motor and a pedestrian crossing react to the outputs of your program, with faults you can trigger.',
        },
        {
          title: 'Hints before the solution',
          text: 'Two levels of hint, the solution only on request, and a teacher can hide it.',
        },
      ],
      captureAlt: 'The first lesson of Learn open beside the editor, after Check passed.',
      courseTitle: 'The course, module by module',
      levels: ['Foundation', 'Intermediate', 'Advanced'],
      modules: [
        'Getting ready',
        'How a PLC thinks',
        'Boolean logic and latching',
        'Timers, edges and counters',
        'Data and analog scaling',
        'State machines and sequences',
        'Feedback, faults and interlocks',
        'Structuring programs',
        'Testing and diagnosis',
        'One logic in five languages',
        'Modbus and MQTT basics',
        'Capstone: a small machine',
      ],
      plantsTitle: 'The plants your program drives',
      plants: {
        tank: { name: 'Tank', lesson: 'Tank level, faults, and reset', alt: 'Illustration of a tank with a pump and two level switches.' },
        conveyor: {
          name: 'Conveyor',
          lesson: 'Conveyor classification and safe jam',
          alt: 'Illustration of a belt conveyor with part sensors and a diverter.',
        },
        motor: { name: 'Motor', lesson: 'Command, feedback, and speed', alt: 'Illustration of an electric motor with a speed sensor.' },
        crossing: {
          name: 'Pedestrian crossing',
          lesson: 'Pedestrian crossing and safe states',
          alt: 'Illustration of a pedestrian crossing with signal lamps and a push button.',
        },
      },
      links: [
        { label: 'Start with Learn', to: '/docs/learn' },
        { label: 'For educators', to: '/docs/learn/educators' },
      ],
    },
    specs: {
      title: 'Technical data',
      rows: [
        {
          label: 'Languages',
          value: 'IEC 61131-3 Structured Text, Instruction List, Ladder Diagram, Function Block Diagram and Sequential Function Chart.',
        },
        { label: 'Runtime', value: 'A virtual machine in portable C99, with a scheduler and a process image.' },
        { label: 'Platforms', value: 'Zephyr RTOS, FreeRTOS, and the simulator on your computer.' },
        { label: 'Boards', value: 'Seven board profiles with RP2040, STM32 and ESP32-S3 chips.' },
        { label: 'Tasks', value: 'Up to 16 tasks in a program, each with its own interval and priority.' },
        {
          label: 'Library',
          value:
            '34 standard function blocks (timers, counters, edges, bistables, pulse generators, process control, buffers and ' +
            'communication) and 297 standard functions, 240 of them type conversions.',
        },
        { label: 'Communication', value: 'Function blocks for Modbus, MQTT with Sparkplug B, and Azure and AWS cloud services.' },
        { label: 'Debugging', value: 'Breakpoints, pause, one-cycle step, watch, force, and the live I/O faceplate.' },
        { label: 'Testing', value: 'Scenario tests in the application and in `zplc-cli` for a CI job.' },
        { label: 'Examples', value: '46 example projects bundled on the Welcome screen.' },
        { label: 'Application', value: 'A desktop application for Windows, macOS and Linux, in English and Spanish.' },
        {
          label: 'AI assistants',
          value: 'An MCP server lets an assistant build and test a project. It never flashes, deploys, forces, starts or stops.',
        },
        { label: 'Licence', value: 'MIT, free and open source.' },
      ],
    },
    close: {
      title: 'Start building, or start learning',
      sourceTitle: 'Free and open source',
      source: 'ZPLC is MIT-licensed. The runtime, the compiler, the application, the course and this site live in one public repository.',
      sourceLinks: [
        { label: 'Repository', href: repositoryUrl },
        { label: 'Contributing', to: '/docs/contributing' },
        { label: 'Discussions', href: 'https://github.com/eduardojvieira/ZPLC/discussions' },
        { label: 'Release notes', to: '/docs/release-notes' },
      ],
    },
  },
  es: {
    home: {
      metaTitle: 'El PLC de código abierto para el microcontrolador que usted elija',
      metaDescription:
        'ZPLC es un PLC IEC 61131-3 de código abierto: prográmelo en cinco lenguajes, simúlelo y depúrelo en su equipo, compile ' +
        'su runtime portable para su placa y aprenda a programar PLC con el curso incluido en la aplicación.',
    },
    hero: {
      title: 'El PLC de código abierto para el microcontrolador que usted elija.',
      lead:
        'Prográmelo en los cinco lenguajes IEC 61131-3, simúlelo y depúrelo en su equipo, y luego compile el mismo runtime para ' +
        'su placa. Gratuito y de código abierto.',
      artAlt:
        'Ilustración: un peldaño de diagrama de escalera dibujado como esquema, cableado a los bornes de un módulo controlador ' +
        'genérico sobre un riel DIN; el camino hasta una salida está resaltado.',
    },
    paths: {
      label: 'Dos maneras de empezar',
      build: {
        title: 'Construya un controlador',
        text: 'Programe, simule y depure en la aplicación ZPLC, y luego compile el runtime para su placa.',
        action: 'Descargar ZPLC',
        note: 'Para Windows, macOS y Linux.',
        more: 'Primeros pasos',
      },
      learn: {
        title: 'Aprenda a programar PLC',
        text: 'Un curso gratuito de 33 lecciones dentro de la misma aplicación. ZPLC comprueba su programa en cada lección.',
        action: 'Empezar a aprender',
        note: 'En inglés y en español.',
        more: 'Para docentes',
      },
    },
    portability: {
      title: 'Escriba el programa una vez. Elija el hardware.',
      lead:
        'Su programa se ejecuta en el mismo runtime de ZPLC en todas partes: en placas con Zephyr RTOS, en el port para FreeRTOS ' +
        'y en el simulador de su equipo. Si su placa todavía no está en la lista, puede traerla.',
      wiring: {
        label: 'Un programa, un runtime, tres plataformas',
        program: { name: 'Su programa', text: 'ST · IL · LD · FBD · SFC' },
        runtime: { name: 'Runtime de ZPLC', text: 'El mismo núcleo en cada plataforma.' },
      },
      platforms: [
        {
          name: 'Zephyr RTOS',
          text: 'Siete perfiles de placa con chips RP2040, STM32 y ESP32-S3, desde placas serie hasta Ethernet y Wi-Fi.',
          to: '/docs/reference/boards',
        },
        {
          name: 'FreeRTOS',
          text: 'Un segundo port a un RTOS, comprobado con la suite de conformidad de ports en CI.',
          to: '/docs/runtime/port-interface',
        },
        {
          name: 'Su equipo',
          text: 'El simulador de la aplicación ZPLC, compilado para Windows, macOS y Linux.',
          to: '/docs/guides/simulate-and-debug',
        },
      ],
      port: {
        title: 'Traiga su propio microcontrolador',
        text:
          'Un port nuevo implementa las 18 funciones de la capa de abstracción de hardware. Luego la suite de conformidad de ports ' +
          'comprueba en él cada instrucción, el planificador, la E/S y el almacenamiento.',
      },
      links: [
        { label: 'Portar a una placa', to: '/docs/guides/port-to-a-board' },
        { label: 'Interfaz de port', to: '/docs/runtime/port-interface' },
      ],
      strip: {
        title: 'Capa de abstracción de hardware',
        count: '18 funciones, 2 opcionales',
        groups: {
          clock: { label: 'Reloj', terminals: ['tick', 'espera'] },
          io: {
            label: 'Entradas y salidas',
            terminals: ['entrada digital', 'salida digital', 'entrada analógica', 'salida analógica', 'tabla de E/S', 'canales'],
          },
          storage: { label: 'Almacenamiento', terminals: ['guardar', 'cargar', 'borrar'] },
          locks: { label: 'Bloqueos', terminals: ['crear', 'bloquear', 'desbloquear', 'destruir'] },
          life: { label: 'Registro y ciclo de vida', terminals: ['registro', 'inicio', 'apagado'] },
          network: { label: 'Red, opcional', terminals: ['iniciar la red', 'dirección IP'] },
        },
      },
    },
    boards: {
      title: 'Siete placas para empezar',
      lead:
        'Perfiles de placa para chips RP2040, STM32 y ESP32-S3, desde placas serie hasta Ethernet y Wi-Fi. Cada uno se compila con ' +
        'cada cambio y cabe en su presupuesto de flash y RAM. Dos de ellos son las placas del estudiante del curso.',
      artAlt: 'Ilustración: placas de microcontrolador genéricas de distinto tamaño sobre un riel DIN, cableadas a un bloque de bornes.',
      columns: { board: 'Placa', target: 'Destino de Zephyr', network: 'Red' },
      learner: 'Placa del curso',
      report: '¿Usa ZPLC en una placa propia? Cuéntele al proyecto qué ocurrió, con la imagen que grabó.',
      links: [
        { label: 'Todas las placas', to: '/docs/reference/boards' },
        { label: 'Informar sobre su placa', href: boardReportUrl },
      ],
    },
    languages: {
      title: 'Cinco lenguajes IEC 61131-3, un editor para cada uno',
      lead:
        'Dibuje peldaños de escalera, conecte bloques de función, encadene una secuencia o escriba texto estructurado y lista de ' +
        'instrucciones. Cada lenguaje tiene su propio editor, y los cinco se compilan para el mismo runtime.',
      tabsLabel: 'Lenguajes IEC 61131-3',
      features: [
        {
          title: 'Autocompletado y navegación',
          text: 'El texto estructurado tiene autocompletado, ir a la definición, buscar referencias y renombrar en todo el proyecto.',
        },
        {
          title: 'Diagramas desde el teclado',
          text: 'Peldaños, bloques y etapas se colocan y conectan sin el ratón.',
        },
        {
          title: 'Una paleta de comandos',
          text: 'Cada comando de la aplicación está a una búsqueda, con Ctrl+Shift+P.',
        },
      ],
      items: [
        {
          code: 'ST',
          name: 'Texto estructurado',
          text:
            'Un editor de texto para texto estructurado. Mientras el programa se ejecuta, cada variable muestra su valor junto a ' +
            'su línea.',
          alt: 'El editor de texto estructurado de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de texto estructurado',
        },
        {
          code: 'IL',
          name: 'Lista de instrucciones',
          text:
            'Lista de instrucciones en el mismo editor de texto, con puntos de interrupción en una línea y valores que se pueden ' +
            'observar y forzar.',
          alt: 'El editor de lista de instrucciones de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de lista de instrucciones',
        },
        {
          code: 'LD',
          name: 'Diagrama de escalera',
          text:
            'Peldaños armados desde la caja de herramientas o solo con el teclado, con los valores del peldaño mientras el ' +
            'programa se ejecuta.',
          alt:
            'El editor de diagrama de escalera de ZPLC con el ejemplo Blinky: cuatro peldaños y una caja de herramientas con ' +
            'contactos y bobinas.',
          reference: 'Referencia de diagrama de escalera',
        },
        {
          code: 'FBD',
          name: 'Diagrama de bloques de función',
          text:
            'Bloques colocados y conectados en un lienzo, también desde el teclado, con valores en línea mientras el programa se ' +
            'ejecuta.',
          alt: 'El editor de diagrama de bloques de función de ZPLC con el ejemplo Blinky: dos temporizadores y compuertas lógicas.',
          reference: 'Referencia de diagrama de bloques de función',
        },
        {
          code: 'SFC',
          name: 'Diagrama funcional secuencial',
          text:
            'Etapas, transiciones y acciones en un diagrama, editadas desde el teclado, con el estado en línea del diagrama mientras ' +
            'se ejecuta.',
          alt: 'El editor de diagrama funcional secuencial de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de diagrama funcional secuencial',
        },
      ],
    },
    debug: {
      title: 'Simule y depure antes de cablear nada',
      lead:
        'El simulador es el propio runtime de ZPLC, compilado para su equipo e incluido con la aplicación. Ejecute su programa, ' +
        'deténgalo, avance paso a paso y observe cada valor, sin ninguna placa sobre la mesa.',
      shotAlt:
        'Dos detalles de la aplicación ZPLC con la lección del motor en el simulador: el código con sus valores en vivo y el ' +
        'panel de E/S en vivo, con un interruptor y un pulsador para cada entrada.',
      caption: 'La lección del motor en el simulador: valores en vivo sobre el código y, debajo, el panel de E/S en vivo.',
      rungs: [
        {
          title: 'Puntos de interrupción en cada lenguaje',
          text:
            'Deténgase en una línea de texto estructurado o de lista de instrucciones, en un peldaño, en un bloque de función o en ' +
            'una etapa de un diagrama, y lea los valores de ese ciclo.',
          link: 'Simular y depurar',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'Un ciclo a la vez',
          text: 'Pause entre ciclos, avance un ciclo y reanude donde se detuvo el programa.',
          link: 'Pausar, avanzar y reanudar',
          to: '/docs/ide/features#pausa-reanudación-paso-y-stop',
          timing: true,
        },
        {
          title: 'Observar y forzar',
          text:
            'Observe cualquier variable en decimal, hexadecimal, binario o como tiempo. Un valor forzado sigue marcado como ' +
            'forzado hasta que usted lo libera.',
          link: 'Forzar un valor',
          to: '/docs/guides/force-values',
        },
        {
          title: 'Un panel de E/S en vivo',
          text:
            'Cada entrada del programa tiene un interruptor, un pulsador o un deslizador con su propio nombre, y el cambio llega ' +
            'al programa en el ciclo siguiente.',
          link: 'E/S en vivo',
          to: '/docs/ide/features#es-en-vivo',
        },
        {
          title: 'Pruebas de escenario',
          text:
            'Escriba las entradas en el tiempo y las salidas que espera, y ejecútelas desde la pestaña Pruebas o con `zplc-cli` en ' +
            'un trabajo de CI.',
          link: 'Pruebas de escenario',
          to: '/docs/guides/scenario-tests',
        },
      ],
      timing: {
        caption: 'Un ciclo: leer las entradas, ejecutar las tareas, escribir las salidas. Sin escala.',
        rows: ['Leer entradas', 'Ejecutar tareas', 'Escribir salidas'],
      },
    },
    learn: {
      title: 'Aprenda a programar PLC sin comprar un PLC',
      lead:
        'Un curso gratuito de 33 lecciones en 12 módulos, del ciclo de un PLC a una máquina pequeña, en inglés y en español. ZPLC ' +
        'comprueba su programa en cada lección y le dice qué corregir.',
      facts: [
        {
          title: 'Una devolución en cada intento',
          text:
            'Comprobar ejecuta su programa guardado contra el escenario de la lección y lista cada aserción que falló, con el ' +
            'instante, el valor esperado y el valor observado.',
        },
        {
          title: 'Primero el simulador, la placa cuando esté listo',
          text:
            'Todas las lecciones menos una se ejecutan en el simulador, así que no necesita hardware. 21 de ellas tienen un ' +
            'recorrido para una placa del estudiante, con el cableado en un diagrama y un mapa de pines.',
        },
        {
          title: 'Cuatro máquinas para controlar',
          text:
            'Un tanque, una cinta transportadora, un motor y un cruce peatonal responden a las salidas de su programa, con fallas ' +
            'que usted puede provocar.',
        },
        {
          title: 'Pistas antes de la solución',
          text: 'Dos niveles de pista, la solución solo a pedido, y un docente puede ocultarla.',
        },
      ],
      captureAlt: 'La primera lección de Learn abierta junto al editor, después de que Comprobar pasó.',
      courseTitle: 'El curso, módulo por módulo',
      levels: ['Inicial', 'Intermedio', 'Avanzado'],
      modules: [
        'Primeros pasos',
        'Cómo piensa un PLC',
        'Lógica booleana y retención',
        'Temporizadores, flancos y contadores',
        'Datos y escalado analógico',
        'Máquinas de estado y secuencias',
        'Realimentación, fallas y enclavamientos',
        'Estructura de programas',
        'Pruebas y diagnóstico',
        'Una lógica en cinco lenguajes',
        'Fundamentos de Modbus y MQTT',
        'Proyecto final: una máquina pequeña',
      ],
      plantsTitle: 'Las plantas que maneja su programa',
      plants: {
        tank: {
          name: 'Tanque',
          lesson: 'Nivel de tanque, fallas y reset',
          alt: 'Ilustración de un tanque con una bomba y dos interruptores de nivel.',
        },
        conveyor: {
          name: 'Cinta transportadora',
          lesson: 'Cinta de clasificación y atasco seguro',
          alt: 'Ilustración de una cinta transportadora con sensores de pieza y un desviador.',
        },
        motor: {
          name: 'Motor',
          lesson: 'Orden, realimentación y velocidad',
          alt: 'Ilustración de un motor eléctrico con un sensor de velocidad.',
        },
        crossing: {
          name: 'Cruce peatonal',
          lesson: 'Cruce peatonal y estados seguros',
          alt: 'Ilustración de un cruce peatonal con lámparas de señal y un pulsador.',
        },
      },
      links: [
        { label: 'Empezar con Learn', to: '/docs/learn' },
        { label: 'Para docentes', to: '/docs/learn/educators' },
      ],
    },
    specs: {
      title: 'Datos técnicos',
      rows: [
        {
          label: 'Lenguajes',
          value:
            'IEC 61131-3: texto estructurado, lista de instrucciones, diagrama de escalera, diagrama de bloques de función y ' +
            'diagrama funcional secuencial.',
        },
        { label: 'Runtime', value: 'Una máquina virtual en C99 portable, con planificador e imagen de proceso.' },
        { label: 'Plataformas', value: 'Zephyr RTOS, FreeRTOS y el simulador de su equipo.' },
        { label: 'Placas', value: 'Siete perfiles de placa con chips RP2040, STM32 y ESP32-S3.' },
        { label: 'Tareas', value: 'Hasta 16 tareas por programa, cada una con su intervalo y su prioridad.' },
        {
          label: 'Biblioteca',
          value:
            '34 bloques de función estándar (temporizadores, contadores, flancos, biestables, generadores de pulsos, control de ' +
            'procesos, búferes y comunicación) y 297 funciones estándar, 240 de ellas conversiones de tipo.',
        },
        {
          label: 'Comunicación',
          value: 'Bloques de función para Modbus, MQTT con Sparkplug B y los servicios en la nube de Azure y AWS.',
        },
        {
          label: 'Depuración',
          value: 'Puntos de interrupción, pausa, avance de un ciclo, observación, forzado y el panel de E/S en vivo.',
        },
        { label: 'Pruebas', value: 'Pruebas de escenario en la aplicación y en `zplc-cli` para un trabajo de CI.' },
        { label: 'Ejemplos', value: '46 proyectos de ejemplo incluidos en la pantalla de bienvenida.' },
        { label: 'Aplicación', value: 'Una aplicación de escritorio para Windows, macOS y Linux, en inglés y en español.' },
        {
          label: 'Asistentes de IA',
          value:
            'Un servidor MCP permite que un asistente compile y pruebe un proyecto. Nunca graba, despliega, fuerza, inicia ni detiene.',
        },
        { label: 'Licencia', value: 'MIT, gratuito y de código abierto.' },
      ],
    },
    close: {
      title: 'Empiece a construir, o empiece a aprender',
      sourceTitle: 'Gratuito y de código abierto',
      source:
        'ZPLC tiene licencia MIT. El runtime, el compilador, la aplicación, el curso y este sitio están en un solo repositorio ' +
        'público.',
      sourceLinks: [
        { label: 'Repositorio', href: repositoryUrl },
        { label: 'Contribuir', to: '/docs/contributing' },
        { label: 'Discusiones', href: 'https://github.com/eduardojvieira/ZPLC/discussions' },
        { label: 'Notas de la versión', to: '/docs/release-notes' },
      ],
    },
  },
};

/** The content of one locale, with the data that both locales share. */
export function getLandingPageContent(locale) {
  const lang = locale in landingPageContent ? locale : 'en';
  const content = landingPageContent[lang];
  const { strip } = content.portability;
  return {
    ...content,
    paths: {
      ...content.paths,
      build: { ...content.paths.build, href: releasesUrl, moreTo: '/docs/getting-started' },
      learn: { ...content.paths.learn, to: '/docs/learn', moreTo: '/docs/learn/educators' },
    },
    portability: {
      ...content.portability,
      strip: {
        ...strip,
        groups: halGroups.map((group) => ({ ...group, ...strip.groups[group.key] })),
      },
    },
    languages: {
      ...content.languages,
      items: content.languages.items.map((item, index) => ({
        ...item,
        id: languageIds[index],
        shot: `editors/${languageIds[index]}-${lang}.png`,
        shotDark: `editors/${languageIds[index]}-${lang}-dark.png`,
        to: `/docs/reference/language-${languageIds[index]}`,
      })),
    },
    debug: {
      ...content.debug,
      // a recorded capture of the application (docs/static/img/screen-reader-check/2026-10-20/results.json)
      shot: `screen-reader-check/2026-10-20/${lang}-9-plant-at-speed.png`,
    },
    learn: {
      ...content.learn,
      modules: content.learn.modules.map((title, index) => ({ number: index, title, level: moduleLevels[index] })),
      plants: plantIds.map((plant) => ({ ...plant, ...content.learn.plants[plant.key] })),
      shot: `learn/lesson-checked-${lang}.png`,
      shotDark: `learn/lesson-checked-${lang}-dark.png`,
    },
  };
}

export function useLandingPageContent() {
  const { i18n } = useDocusaurusContext();
  return getLandingPageContent(i18n.currentLocale);
}

/** A string with spans between backticks, as text and `<code>` elements. */
export function withCode(text) {
  return text.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}

/** A heading with the name of the standard kept on one line, so that "61131-3" never breaks at its hyphen. */
export function keepStandard(text) {
  return text.split(/(IEC 61131-3)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
