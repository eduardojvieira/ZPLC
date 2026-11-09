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
  { key: 'io', size: 4 },
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
      metaTitle: 'ZPLC: an open IEC 61131-3 PLC for many microcontrollers',
      metaDescription:
        'ZPLC is an open IEC 61131-3 PLC. A portable C99 core and a small hardware layer carry one program to many ' +
        'microcontrollers. Five languages, a simulator and a debugger, and a free course that teaches PLC programming.',
    },
    hero: {
      title: 'An open PLC for many microcontrollers.',
      lead:
        'ZPLC compiles IEC 61131-3 programs for a portable C99 core and a small hardware layer, so one program can follow you ' +
        'from board to board. Write in five languages, test it in a simulator, and learn the craft with a free course.',
      artAlt:
        'Illustration: a ladder rung drawn as a schematic, wired to the terminals of a generic controller module on a DIN rail; ' +
        'the path to one output is highlighted.',
    },
    paths: {
      label: 'Two equal ways in',
      build: {
        title: 'Build a controller',
        text: 'Write a program, test it in the simulator, then compile the runtime for a board of your choice.',
        action: 'Download ZPLC',
        note: 'Installers for Windows, macOS and Linux.',
        more: 'Get started',
      },
      learn: {
        title: 'Learn PLC programming',
        text: 'Take 68 lessons in 12 modules, starting from zero, in the same application. Every lesson checks the program you write.',
        action: 'Start learning',
        note: 'The course is in English and Spanish.',
        more: 'For educators',
      },
    },
    portability: {
      title: 'One program, many microcontrollers',
      lead:
        'The core that executes your program is plain C99, and everything it needs from a chip sits behind one small hardware ' +
        'layer. Today the program has run in the simulator on your computer. The board builds are cross-build only: they compile ' +
        'and fit their memory budget, and nobody has run a program on a board yet.',
      wiring: {
        label: 'One program, one core, three targets',
        program: { name: 'Your program', text: 'ST · IL · LD · FBD · SFC' },
        runtime: { name: 'ZPLC runtime', text: 'The same portable C99 core for every target.' },
      },
      platforms: [
        {
          name: 'Zephyr RTOS',
          text: 'Seven board profiles on RP2040, STM32 and ESP32-S3 chips. Cross-build only: no program has run on any of them.',
          to: '/docs/reference/boards',
        },
        {
          name: 'FreeRTOS',
          text: 'A second RTOS port. It is shown on a simulator only, and a CI job runs the port conformance suite on it.',
          to: '/docs/runtime/port-interface',
        },
        {
          name: 'Your computer',
          text: 'The simulator inside the ZPLC application, for Windows, macOS and Linux. This is where programs run today.',
          to: '/docs/guides/simulate-and-debug',
        },
      ],
      port: {
        title: 'Bring a microcontroller of your own',
        text:
          'Porting means writing the 18 functions of the hardware layer: clock, inputs and outputs, storage, locks, log and ' +
          'life cycle, plus an optional network pair. The conformance suite then checks the instructions, the scheduler, the ' +
          'I/O and the storage on your port.',
      },
      links: [
        { label: 'Port to a board', to: '/docs/guides/port-to-a-board' },
        { label: 'Port interface', to: '/docs/runtime/port-interface' },
      ],
      strip: {
        title: 'The hardware layer (HAL)',
        count: '18 functions, 2 optional',
        groups: {
          clock: { label: 'Clock', terminals: ['tick', 'sleep'] },
          io: {
            label: 'Inputs and outputs',
            terminals: ['digital in', 'digital out', 'analog in', 'analog out'],
          },
          storage: { label: 'Storage', terminals: ['save', 'load', 'delete'] },
          locks: { label: 'Locks', terminals: ['create', 'lock', 'unlock', 'destroy'] },
          life: { label: 'Log and life cycle', terminals: ['log', 'start', 'shut down'] },
          network: { label: 'Network, optional', terminals: ['start network', 'IP address'] },
        },
      },
    },
    boards: {
      title: 'Seven boards, all at the cross-build level',
      lead:
        'Each board profile builds on every change and fits its flash and RAM budget. That is the whole evidence: not one of ' +
        'them has run a program on hardware yet. Two are the learner boards of the course. If you try one, tell the project.',
      artAlt: 'Illustration: generic microcontroller boards of different sizes on one DIN rail, wired to one terminal block.',
      columns: { board: 'Board', target: 'Zephyr target', network: 'Network' },
      learner: 'Course board',
      report: 'Tried a board? Report what happened, with the firmware image you built.',
      links: [
        { label: 'All boards', to: '/docs/reference/boards' },
        { label: 'Report your board', href: boardReportUrl },
      ],
    },
    languages: {
      title: 'Five languages, each with its own editor',
      lead:
        'IEC 61131-3 defines two text languages and three graphical ones. ZPLC gives each its editor, and all five compile to ' +
        'the same bytecode, so you pick the language that fits the job.',
      tabsLabel: 'IEC 61131-3 languages',
      features: [
        {
          title: 'Completion and navigation',
          text: 'Structured Text offers completion, go to definition, find references and rename across the project.',
        },
        { title: 'Diagrams from the keyboard', text: 'You can place and wire rungs, blocks and steps without touching the mouse.' },
        { title: 'One command palette', text: 'Press Ctrl+Shift+P and search for any command of the application.' },
      ],
      items: [
        {
          code: 'ST',
          name: 'Structured Text',
          text: 'A text editor for the Pascal-like language. While the program runs, each variable shows its value beside its line.',
          alt: 'The Structured Text editor of ZPLC with the Blinky example.',
          reference: 'Structured Text reference',
        },
        {
          code: 'IL',
          name: 'Instruction List',
          text: 'The assembly-like language in the same text editor, with breakpoints on a line and values to watch and force.',
          alt: 'The Instruction List editor of ZPLC with the Blinky example.',
          reference: 'Instruction List reference',
        },
        {
          code: 'LD',
          name: 'Ladder Diagram',
          text: 'Build rungs from the toolbox or the keyboard. While the program runs, each rung shows the values that flow through it.',
          alt: 'The Ladder Diagram editor of ZPLC with the Blinky example: four rungs and a toolbox of contacts and coils.',
          reference: 'Ladder Diagram reference',
        },
        {
          code: 'FBD',
          name: 'Function Block Diagram',
          text: 'Place blocks on a canvas and wire them, with the mouse or the keyboard. Online values appear on the wires while it runs.',
          alt: 'The Function Block Diagram editor of ZPLC with the Blinky example: two timers and logic gates.',
          reference: 'Function Block Diagram reference',
        },
        {
          code: 'SFC',
          name: 'Sequential Function Chart',
          text: 'Draw steps, transitions and actions, and edit them from the keyboard. The chart marks the active steps while it runs.',
          alt: 'The Sequential Function Chart editor of ZPLC with the Blinky example.',
          reference: 'Sequential Function Chart reference',
        },
      ],
    },
    debug: {
      title: 'Test it on your computer first',
      lead:
        'The simulator is the ZPLC runtime itself, compiled for your computer and bundled with the application. Run a program, ' +
        'stop it where you want, step through it and read every value. You need no board on the desk.',
      shotAlt:
        'Two details of the ZPLC application running the motor lesson in the simulator: the code with its live values, and the ' +
        'Live I/O faceplate with a switch and a push button for each input.',
      caption: 'The motor lesson in the simulator: live values on the code, and the Live I/O faceplate under it.',
      rungs: [
        {
          title: 'A breakpoint in any language',
          text:
            'Stop on a line of Structured Text or Instruction List, a ladder rung, a function block or a step of a chart, and read ' +
            'the values of that scan.',
          link: 'Simulate and debug',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'One scan at a time',
          text: 'Pause between scans, step a single cycle, then resume from the point where the program stopped.',
          link: 'Pause, step and resume',
          to: '/docs/ide/features#pause-resume-step-and-stop',
          timing: true,
        },
        {
          title: 'Watch and force',
          text: 'Show a variable as decimal, hexadecimal, binary or time. A forced value stays marked as forced until you release ' + 'it.',
          link: 'Force a value',
          to: '/docs/guides/force-values',
        },
        {
          title: 'A faceplate for the inputs',
          text:
            'Each input of the program gets a switch, a push button or a slider under its own name. What you change reaches the ' +
            'program on the next scan.',
          link: 'Live I/O',
          to: '/docs/ide/features#live-io',
        },
        {
          title: 'Tests that replay a scenario',
          text: 'Write the inputs over time and the outputs you expect. Run them in the Tests tab, or with `zplc-cli` in a CI job.',
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
        'The course has 68 lessons in 12 modules, in English and Spanish, and it needs no earlier knowledge. Begin with the ' +
        'Ladder path from zero. Each of its lessons opens on a reading page over the main area of the workbench, with figures ' +
        'and try-it labs that run live inside the page. When you are ready, you practise on a simulated machine, and ZPLC ' +
        'checks your program and says what to fix.',
      facts: [
        {
          title: 'Read, try, practise',
          text:
            'A reading page explains one idea and lets you try it in a small lab. Then Practice opens the lesson beside the ' +
            'editor, and Read again brings the page back.',
        },
        {
          title: 'Feedback on every attempt',
          text:
            'Check runs your saved program against the lesson scenario and lists each assertion that failed, with the time, the ' +
            'value expected and the value seen.',
        },
        {
          title: 'The simulator comes first',
          text:
            'All lessons but one run in the simulator, so you need no hardware. 34 of them add an optional track for a learner ' +
            'board, with a wiring diagram and a pin map.',
        },
        {
          title: 'Four machines to drive',
          text: 'A tank, a conveyor, a motor and a pedestrian crossing react to your outputs, with faults you can trigger.',
        },
        {
          title: 'Hints before the solution',
          text: 'There are two levels of hint. The solution appears only when you ask, and a teacher can hide it.',
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
      plantsTitle: 'The machines your program drives',
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
      title: 'At a glance',
      rows: [
        {
          label: 'Languages',
          value: 'IEC 61131-3 Structured Text, Instruction List, Ladder Diagram, Function Block Diagram and Sequential Function Chart.',
        },
        { label: 'Runtime', value: 'A virtual machine in portable C99, with a scheduler and a process image.' },
        { label: 'Targets', value: 'Zephyr RTOS (cross-build only), FreeRTOS (a simulator only) and the simulator on your computer.' },
        { label: 'Boards', value: 'Seven board profiles on RP2040, STM32 and ESP32-S3 chips, all at the cross-build level.' },
        { label: 'Tasks', value: 'Up to 16 tasks in a program, each with its own interval and priority.' },
        {
          label: 'Library',
          value:
            '34 standard function blocks (timers, counters, edges, bistables, pulse generators, process control, buffers and ' +
            'communication) and 297 standard functions, 240 of them type conversions.',
        },
        { label: 'Communication', value: 'Function blocks for Modbus, MQTT with Sparkplug B, and Azure and AWS cloud services.' },
        { label: 'Debugging', value: 'Breakpoints, pause, one-cycle step, watch, force and the live I/O faceplate.' },
        { label: 'Testing', value: 'Scenario tests in the application, and in `zplc-cli` for a CI job.' },
        { label: 'Examples', value: '81 example projects, bundled on the Welcome screen.' },
        { label: 'Application', value: 'A desktop application for Windows, macOS and Linux, in English and Spanish.' },
        {
          label: 'AI assistants',
          value: 'An MCP server lets an assistant build and test a project. It never flashes, deploys, forces, starts or stops.',
        },
        { label: 'Licence', value: 'MIT, free and open source.' },
      ],
    },
    close: {
      title: 'Build a controller, or learn how',
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
      metaTitle: 'ZPLC: un PLC abierto IEC 61131-3 para muchos microcontroladores',
      metaDescription:
        'ZPLC es un PLC abierto IEC 61131-3. Un núcleo portable en C99 y una pequeña capa de hardware llevan un mismo programa a ' +
        'muchos microcontroladores. Cinco lenguajes, un simulador y un depurador, y un curso gratuito que enseña a programar PLC.',
    },
    hero: {
      title: 'Un PLC abierto para muchos microcontroladores.',
      lead:
        'ZPLC compila programas IEC 61131-3 para un núcleo portable en C99 y una pequeña capa de hardware, de modo que un mismo ' +
        'programa pueda pasar de una placa a otra. Escriba en cinco lenguajes, pruébelo en un simulador y aprenda el oficio con un ' +
        'curso gratuito.',
      artAlt:
        'Ilustración: un peldaño de diagrama de escalera dibujado como esquema, cableado a los bornes de un módulo controlador ' +
        'genérico sobre un riel DIN; el camino hasta una salida está resaltado.',
    },
    paths: {
      label: 'Dos entradas, con el mismo peso',
      build: {
        title: 'Construya un controlador',
        text: 'Escriba un programa, pruébelo en el simulador y compile el runtime para la placa que elija.',
        action: 'Descargar ZPLC',
        note: 'Instaladores para Windows, macOS y Linux.',
        more: 'Primeros pasos',
      },
      learn: {
        title: 'Aprenda a programar PLC',
        text: 'Siga 68 lecciones en 12 módulos, desde cero, en la misma aplicación. Cada lección comprueba el programa que usted escribe.',
        action: 'Empezar a aprender',
        note: 'El curso está en inglés y en español.',
        more: 'Para docentes',
      },
    },
    portability: {
      title: 'Un programa, muchos microcontroladores',
      lead:
        'El núcleo que ejecuta su programa es C99 puro, y todo lo que necesita de un chip está detrás de una pequeña capa de ' +
        'hardware. Hoy el programa se ha ejecutado en el simulador de su computadora. Las compilaciones para placa son solo de ' +
        'compilación cruzada: compilan y caben en su presupuesto de memoria, y nadie ha ejecutado todavía un programa en una placa.',
      wiring: {
        label: 'Un programa, un núcleo, tres destinos',
        program: { name: 'Su programa', text: 'ST · IL · LD · FBD · SFC' },
        runtime: { name: 'Runtime de ZPLC', text: 'El mismo núcleo portable en C99 para cada destino.' },
      },
      platforms: [
        {
          name: 'Zephyr RTOS',
          text:
            'Siete perfiles de placa con chips RP2040, STM32 y ESP32-S3. Solo compilación cruzada: ningún programa se ha ejecutado ' +
            'en ellas.',
          to: '/docs/reference/boards',
        },
        {
          name: 'FreeRTOS',
          text:
            'Un segundo puerto a un RTOS. Se muestra solo en un simulador, y un trabajo de CI le aplica la suite de conformidad ' +
            'de puertos.',
          to: '/docs/runtime/port-interface',
        },
        {
          name: 'Su computadora',
          text: 'El simulador dentro de la aplicación ZPLC, para Windows, macOS y Linux. Aquí se ejecutan hoy los programas.',
          to: '/docs/guides/simulate-and-debug',
        },
      ],
      port: {
        title: 'Traiga un microcontrolador propio',
        text:
          'Portar significa escribir las 18 funciones del HAL: reloj, entradas y salidas, almacenamiento, cerrojos, registro y ciclo ' +
          'de vida, más un par de red opcional. Luego la suite de conformidad comprueba en su puerto las instrucciones, el ' +
          'planificador, la E/S y el almacenamiento.',
      },
      links: [
        { label: 'Portar a una placa', to: '/docs/guides/port-to-a-board' },
        { label: 'Interfaz de puerto', to: '/docs/runtime/port-interface' },
      ],
      strip: {
        title: 'La capa de hardware (el HAL)',
        count: '18 funciones, 2 opcionales',
        groups: {
          clock: { label: 'Reloj', terminals: ['tick', 'espera'] },
          io: {
            label: 'Entradas y salidas',
            terminals: ['entrada digital', 'salida digital', 'entrada analógica', 'salida analógica'],
          },
          storage: { label: 'Almacenamiento', terminals: ['guardar', 'cargar', 'borrar'] },
          locks: { label: 'Cerrojos', terminals: ['crear', 'bloquear', 'desbloquear', 'destruir'] },
          life: { label: 'Registro y ciclo de vida', terminals: ['registro', 'inicio', 'apagado'] },
          network: { label: 'Red, opcional', terminals: ['iniciar la red', 'dirección IP'] },
        },
      },
    },
    boards: {
      title: 'Siete placas, todas en el nivel de compilación cruzada',
      lead:
        'Cada perfil de placa se compila con cada cambio y cabe en su presupuesto de flash y RAM. Esa es toda la evidencia: ' +
        'ninguna ha ejecutado todavía un programa en hardware. Dos son las placas del estudiante del curso. Si prueba una, ' +
        'cuéntele al proyecto.',
      artAlt: 'Ilustración: placas de microcontrolador genéricas de distinto tamaño sobre un riel DIN, cableadas a un bloque de bornes.',
      columns: { board: 'Placa', target: 'Destino de Zephyr', network: 'Red' },
      learner: 'Placa del curso',
      report: '¿Probó una placa? Informe qué ocurrió, con la imagen de firmware que compiló.',
      links: [
        { label: 'Todas las placas', to: '/docs/reference/boards' },
        { label: 'Informar sobre su placa', href: boardReportUrl },
      ],
    },
    languages: {
      title: 'Cinco lenguajes, cada uno con su editor',
      lead:
        'IEC 61131-3 define dos lenguajes de texto y tres gráficos. ZPLC da a cada uno su editor, y los cinco se compilan al mismo ' +
        'código de bytes, de modo que usted elige el lenguaje que conviene al trabajo.',
      tabsLabel: 'Lenguajes IEC 61131-3',
      features: [
        {
          title: 'Autocompletado y navegación',
          text: 'El texto estructurado ofrece autocompletado, ir a la definición, buscar referencias y renombrar en todo el proyecto.',
        },
        {
          title: 'Diagramas desde el teclado',
          text: 'Puede colocar y conectar peldaños, bloques y pasos sin tocar el ratón.',
        },
        {
          title: 'Una paleta de comandos',
          text: 'Pulse Ctrl+Shift+P y busque cualquier comando de la aplicación.',
        },
      ],
      items: [
        {
          code: 'ST',
          name: 'Texto estructurado',
          text:
            'Un editor de texto para el lenguaje de estilo Pascal. Mientras el programa se ejecuta, cada variable muestra su valor ' +
            'junto a su línea.',
          alt: 'El editor de texto estructurado de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de texto estructurado',
        },
        {
          code: 'IL',
          name: 'Lista de instrucciones',
          text:
            'El lenguaje de estilo ensamblador en el mismo editor de texto, con puntos de parada en una línea y valores para ' +
            'observar y forzar.',
          alt: 'El editor de lista de instrucciones de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de lista de instrucciones',
        },
        {
          code: 'LD',
          name: 'Diagrama de escalera',
          text:
            'Arme peldaños desde la caja de herramientas o el teclado. Mientras el programa se ejecuta, cada peldaño muestra los ' +
            'valores que pasan por él.',
          alt:
            'El editor de diagrama de escalera de ZPLC con el ejemplo Blinky: cuatro peldaños y una caja de herramientas con ' +
            'contactos y bobinas.',
          reference: 'Referencia de diagrama de escalera',
        },
        {
          code: 'FBD',
          name: 'Diagrama de bloques de función',
          text:
            'Coloque bloques en un lienzo y conéctelos, con el ratón o el teclado. Los valores en línea aparecen sobre los cables ' +
            'mientras se ejecuta.',
          alt: 'El editor de diagrama de bloques de función de ZPLC con el ejemplo Blinky: dos temporizadores y compuertas lógicas.',
          reference: 'Referencia de diagrama de bloques de función',
        },
        {
          code: 'SFC',
          name: 'Diagrama funcional secuencial',
          text:
            'Dibuje pasos, transiciones y acciones, y edítelos desde el teclado. El diagrama marca los pasos activos mientras se ' +
            'ejecuta.',
          alt: 'El editor de diagrama funcional secuencial de ZPLC con el ejemplo Blinky.',
          reference: 'Referencia de diagrama funcional secuencial',
        },
      ],
    },
    debug: {
      title: 'Pruébelo primero en su computadora',
      lead:
        'El simulador es el propio runtime de ZPLC, compilado para su computadora e incluido con la aplicación. Ejecute un ' +
        'programa, deténgalo donde quiera, avance paso a paso y lea cada valor. No necesita ninguna placa sobre la mesa.',
      shotAlt:
        'Dos detalles de la aplicación ZPLC con la lección del motor en el simulador: el código con sus valores en vivo y el ' +
        'panel de E/S en vivo, con un interruptor y un pulsador para cada entrada.',
      caption: 'La lección del motor en el simulador: valores en vivo sobre el código y, debajo, el panel de E/S en vivo.',
      rungs: [
        {
          title: 'Un punto de parada en cualquier lenguaje',
          text:
            'Deténgase en una línea de texto estructurado o de lista de instrucciones, en un peldaño, en un bloque de función o en ' +
            'un paso de un diagrama, y lea los valores de ese ciclo.',
          link: 'Simular y depurar',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'Un ciclo a la vez',
          text: 'Pause entre ciclos, avance un solo ciclo y reanude desde el punto donde se detuvo el programa.',
          link: 'Pausar, avanzar y reanudar',
          to: '/docs/ide/features#pausa-reanudación-paso-y-stop',
          timing: true,
        },
        {
          title: 'Observar y forzar',
          text:
            'Muestre una variable en decimal, hexadecimal, binario o como tiempo. Un valor forzado sigue marcado como forzado hasta ' +
            'que usted lo libere.',
          link: 'Forzar un valor',
          to: '/docs/guides/force-values',
        },
        {
          title: 'Un panel para las entradas',
          text:
            'Cada entrada del programa recibe un interruptor, un pulsador o un deslizador con su propio nombre. Lo que usted ' +
            'cambia llega al programa en el ciclo siguiente.',
          link: 'E/S en vivo',
          to: '/docs/ide/features#es-en-vivo',
        },
        {
          title: 'Pruebas que repiten un escenario',
          text:
            'Escriba las entradas en el tiempo y las salidas que espera. Ejecútelas en la pestaña Pruebas o con `zplc-cli` en un ' +
            'trabajo de CI.',
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
        'El curso tiene 68 lecciones en 12 módulos, en inglés y en español, y no exige conocimientos previos. Empiece por la ruta ' +
        'de diagrama de escalera desde cero. Cada una de sus lecciones abre con una página de lectura sobre el área principal del ' +
        'banco de trabajo, con figuras y laboratorios para probar que se ejecutan dentro de la página. Cuando esté listo, practique ' +
        'con una máquina simulada, y ZPLC comprueba su programa y le dice qué corregir.',
      facts: [
        {
          title: 'Leer, probar, practicar',
          text:
            'Una página de lectura explica una idea y le deja probarla en un laboratorio pequeño. Luego Practicar abre la lección ' +
            'junto al editor, y Volver a leer devuelve la página.',
        },
        {
          title: 'Una respuesta en cada intento',
          text:
            'Comprobar ejecuta su programa guardado contra el escenario de la lección y enumera cada aserción que falló, con el ' +
            'instante, el valor esperado y el valor observado.',
        },
        {
          title: 'Primero el simulador',
          text:
            'Todas las lecciones menos una se ejecutan en el simulador, así que no necesita hardware. 34 de ellas añaden una ruta ' +
            'opcional para una placa del estudiante, con un diagrama de cableado y un mapa de pines.',
        },
        {
          title: 'Cuatro máquinas para controlar',
          text:
            'Un tanque, una cinta transportadora, un motor y un cruce peatonal responden a sus salidas, con fallas que usted puede ' +
            'provocar.',
        },
        {
          title: 'Pistas antes de la solución',
          text: 'Hay dos niveles de pista. La solución aparece solo si usted la pide, y un docente puede ocultarla.',
        },
      ],
      captureAlt: 'La primera lección de Aprender abierta junto al editor, después de que Comprobar pasó.',
      courseTitle: 'El curso, módulo por módulo',
      levels: ['Base', 'Intermedio', 'Avanzado'],
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
      plantsTitle: 'Las máquinas que controla su programa',
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
        { label: 'Empezar con Aprender', to: '/docs/learn' },
        { label: 'Para docentes', to: '/docs/learn/educators' },
      ],
    },
    specs: {
      title: 'De un vistazo',
      rows: [
        {
          label: 'Lenguajes',
          value:
            'IEC 61131-3: texto estructurado, lista de instrucciones, diagrama de escalera, diagrama de bloques de función y ' +
            'diagrama funcional secuencial.',
        },
        { label: 'Runtime', value: 'Una máquina virtual en C99 portable, con planificador e imagen de proceso.' },
        {
          label: 'Destinos',
          value: 'Zephyr RTOS (solo compilación cruzada), FreeRTOS (solo un simulador) y el simulador de su computadora.',
        },
        {
          label: 'Placas',
          value: 'Siete perfiles de placa con chips RP2040, STM32 y ESP32-S3, todos en el nivel de compilación cruzada.',
        },
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
          value: 'Puntos de parada, pausa, avance de un ciclo, observación, forzado y el panel de E/S en vivo.',
        },
        { label: 'Pruebas', value: 'Pruebas de escenario en la aplicación y en `zplc-cli` para un trabajo de CI.' },
        { label: 'Ejemplos', value: '81 proyectos de ejemplo, incluidos en la pantalla de bienvenida.' },
        { label: 'Aplicación', value: 'Una aplicación de escritorio para Windows, macOS y Linux, en inglés y en español.' },
        {
          label: 'Asistentes de IA',
          value:
            'Un servidor MCP permite que un asistente compile y pruebe un proyecto. Nunca graba, carga en el dispositivo, fuerza, ' +
            'inicia ni detiene.',
        },
        { label: 'Licencia', value: 'MIT, gratuito y de código abierto.' },
      ],
    },
    close: {
      title: 'Construya un controlador, o aprenda cómo',
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
