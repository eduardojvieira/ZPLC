import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// The text of the landing page, in English and in Spanish. Every claim here is backed by a file of the repository; the list
// is in docs/design/content-outline.md. tools/docs/check_capability_claims.ts and tools/ci/product-name.ts read this file.
// A span between backticks is a literal identifier and is set in code.

const releasesUrl = 'https://github.com/eduardojvieira/ZPLC/releases';

const languageIds = ['st', 'il', 'ld', 'fbd', 'sfc'];

// The functions of firmware/lib/zplc_core/include/zplc_hal.h, in the groups of docs/docs/runtime/port-interface.md. The last
// group is optional: the portable core does not call it.
const halGroups = [
  { key: 'clock', functions: ['zplc_hal_tick', 'zplc_hal_sleep'] },
  {
    key: 'io',
    functions: [
      'zplc_hal_gpio_read',
      'zplc_hal_gpio_write',
      'zplc_hal_adc_read',
      'zplc_hal_dac_write',
      'zplc_io_table',
      'zplc_io_channel_count',
    ],
  },
  { key: 'storage', functions: ['zplc_hal_persist_save', 'zplc_hal_persist_load', 'zplc_hal_persist_delete'] },
  { key: 'locks', functions: ['zplc_hal_mutex_create', 'zplc_hal_mutex_lock', 'zplc_hal_mutex_unlock', 'zplc_hal_mutex_destroy'] },
  { key: 'life', functions: ['zplc_hal_log', 'zplc_hal_init', 'zplc_hal_shutdown'] },
  { key: 'network', optional: true, functions: ['zplc_hal_net_init', 'zplc_hal_net_get_ip'] },
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
      metaTitle: 'Open-source IEC 61131-3 PLC runtime and development environment',
      metaDescription:
        'ZPLC compiles the five IEC 61131-3 languages to one bytecode. Its C99 runtime builds for Zephyr boards and runs as a ' +
        'simulator on your computer, and its desktop application edits, simulates and tests programs.',
    },
    hero: {
      title: 'Open-source IEC 61131-3 PLC runtime and development environment on Zephyr RTOS.',
      lead: 'Program, simulate, and verify deterministic IEC 61131-3 control logic.',
      download: 'Download',
      downloadHref: releasesUrl,
      start: 'Get started',
      startTo: '/docs/getting-started',
      artAlt:
        'Illustration: a ladder rung drawn as a schematic, wired to the terminals of a generic controller module on a DIN rail; ' +
        'the path to one output is highlighted.',
      statusLabel: 'Prerelease',
      status: 'Version 2.0 is for evaluation. No board has been tested on hardware, and ZPLC must not control machinery.',
      statusLink: 'Safety and limitations',
      statusTo: '/docs/safety-and-limitations',
    },
    different: {
      title: 'What makes ZPLC different',
      lead: 'The parts of ZPLC that set it apart, each with the page that shows how it is checked.',
      port: {
        title: 'A new microcontroller needs 18 functions',
        text:
          'The runtime is portable C99 behind a hardware abstraction layer. A port implements its 18 functions and two optional ' +
          'network calls, then passes the port conformance suite: every opcode, the loader rejections, the scheduler phases and ' +
          'faults, timing, I/O and storage.',
        targetsTitle: 'Ports in the repository',
        targets: [
          {
            name: 'Zephyr RTOS',
            text:
              'Seven board profiles on RP2040, STM32 and ESP32-S3 chips build in CI. The conformance suite runs on `native_sim` ' +
              'and on QEMU Cortex-M3 and M0. No board has been tested on hardware yet.',
          },
          { name: 'POSIX host', text: 'The simulator of the ZPLC application is this port, built from the same C sources.' },
          { name: 'FreeRTOS', text: 'Built and conformance-tested on the FreeRTOS POSIX simulator in CI.' },
        ],
        stripTitle: 'The hardware abstraction layer',
        groups: {
          clock: 'Clock',
          io: 'I/O table',
          storage: 'Storage',
          locks: 'Locks',
          life: 'Log and life cycle',
          network: 'Network, optional',
        },
        links: [
          { label: 'Port interface and conformance suite', to: '/docs/runtime/port-interface' },
          { label: 'Port to a board', to: '/docs/guides/port-to-a-board' },
        ],
      },
      rungs: [
        {
          title: 'Simulate before any hardware',
          text:
            'The simulator is the same C runtime, built for your computer and bundled with ZPLC. Scenario tests set inputs and ' +
            'check outputs over time, in the Tests tab or with `zplc-cli` in a CI job.',
          link: 'Scenario tests',
          to: '/docs/guides/scenario-tests',
        },
        {
          title: 'Watch, force and step online',
          text:
            'In all five languages: values on the program while it runs, breakpoints, pause and a one-cycle step, and forced ' +
            'values that stay marked as forced.',
          link: 'Simulate and debug',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'A scan in a fixed order',
          text:
            'Tasks released together run by release time, then priority, then task ID, against one snapshot of the inputs. A ' +
            'program has up to 16 tasks, each with its own interval. The interval is a deadline; no board has a measured scan ' +
            'time yet.',
          link: 'Scheduler',
          to: '/docs/runtime/scheduler',
          timing: true,
        },
        {
          title: 'A person starts every physical action',
          text:
            'Learn and the MCP server for AI assistants never flash, deploy, force, or start and stop a program. A person does, ' +
            'with the controls of ZPLC.',
          link: 'AI assistants and MCP',
          to: '/docs/guides/ai-and-mcp',
        },
        {
          title: 'Communication blocks',
          text:
            'Function blocks for Modbus, MQTT with Sparkplug B, and cloud services. They are checked against servers written for ' +
            'the tests on this computer, not yet against a live broker or a device on a wire.',
          link: 'Communication function blocks',
          to: '/docs/runtime/communication-function-blocks',
        },
        {
          title: 'English and Spanish',
          text: 'The application, the 33 lessons and this documentation, in English and in neutral Spanish.',
          link: 'Getting started',
          to: '/docs/getting-started',
        },
      ],
      timing: {
        caption: 'The order of one scan, not to scale',
        rows: ['Read inputs', 'Run tasks', 'Write outputs'],
      },
    },
    languages: {
      title: 'Five IEC 61131-3 languages, one bytecode',
      lead: 'Write in text or in diagrams. Every language compiles to the same `.zplc` bytecode, which one C99 runtime executes.',
      tabsLabel: 'IEC 61131-3 languages',
      evidenceLabel: 'How this is checked',
      evidence:
        'For each language, an end-to-end test of ZPLC edits, builds, simulates, debugs, forces and deploys a program. Deploy goes ' +
        'to the native runtime behind an emulated board; no physical board takes part.',
      evidenceLink: 'Languages and their evidence',
      evidenceTo: '/docs/languages',
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
    learn: {
      title: 'Learn PLC programming in ZPLC',
      lead:
        'A course of 33 lessons in 12 modules, from the scan cycle to a small machine, in English and Spanish. ZPLC grades every ' +
        'lesson, and all but one run in the simulator with no board and no network.',
      facts: [
        {
          title: 'Graded against a scenario',
          text:
            'Check runs your saved program against the scenario of the lesson and lists each assertion that failed, with the ' +
            'time, the value expected and the value seen.',
        },
        {
          title: 'Two tracks',
          text:
            'All lessons but one run in simulation. 21 of them also take the lesson to a learner board, with the wiring as a diagram and ' +
            'a pin ' +
            'map; no check on a board has been recorded yet.',
        },
        {
          title: 'Four simulated plants',
          text: 'A tank, a conveyor, a motor and a pedestrian crossing answer the outputs of your program.',
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
    architecture: {
      title: 'From a rung to a pin',
      lead:
        'ZPLC compiles every language to `.zplc` bytecode. A C99 virtual machine runs it, and the hardware abstraction layer ' +
        'connects it to the platform.',
      app: 'ZPLC application: edit, build, simulate, test, deploy, monitor',
      stages: [
        { title: 'Source', items: ['ST', 'IL', 'LD', 'FBD', 'SFC'] },
        { title: 'Compiler', items: ['TypeScript', '`packages/zplc-compiler`'] },
        { title: 'Bytecode', items: ['`.zplc`', 'verified by the loader'] },
        { title: 'Runtime', items: ['C99 virtual machine', 'scheduler, process image'] },
        { title: 'HAL', items: ['18 functions', '2 optional'] },
      ],
      ports: [
        { name: 'Zephyr RTOS', note: '7 board profiles, cross-build' },
        { name: 'POSIX host', note: 'the simulator of ZPLC' },
        { name: 'FreeRTOS', note: 'POSIX simulator, in CI' },
      ],
      links: [
        { label: 'Runtime', to: '/docs/runtime' },
        { label: 'Instruction set', to: '/docs/runtime/isa' },
        { label: 'HAL contract', to: '/docs/runtime/hal-contract' },
        { label: 'System architecture', to: '/docs/architecture' },
      ],
    },
    boards: {
      title: 'Boards, at the level their evidence gives',
      lead:
        'Seven Zephyr board profiles build in CI and fit their flash and RAM budgets. None has been flashed, booted or run on ' +
        'hardware yet; the next level needs a recorded test on the exact board.',
      levels: [
        { id: 'cross-build', text: 'The firmware builds for the board and fits its flash and RAM budget.' },
        { id: 'community-reported', text: 'A user reported what happened on their own board, with the image it ran.' },
        { id: 'human-hil', text: 'A person ran a recorded procedure on the exact board, with the image named by commit and hash.' },
        { id: 'production-qualified', text: 'A separately governed production evidence package exists.' },
      ],
      columns: { board: 'Board', target: 'Zephyr target', network: 'Network', level: 'Level' },
      learner: 'Learner board of the course',
      links: [
        { label: 'Boards', to: '/docs/reference/boards' },
        { label: 'Hardware support', to: '/docs/reference/capabilities-evidence' },
      ],
    },
    limits: {
      title: 'What ZPLC is not',
      items: [
        'It is not a safety PLC, and no part of it has been certified or assessed against a functional-safety standard.',
        'It must not control machinery or protect people: not as an emergency stop, an interlock or a guard.',
        'It does not guarantee timing: no board has a measured scan time, jitter or worst-case execution time.',
        'Version 2.0 is a prerelease for evaluation, and no board is past the level its records give.',
      ],
      link: 'Safety and limitations',
      to: '/docs/safety-and-limitations',
    },
    get: {
      title: 'Get ZPLC',
      lead: 'The installers are files of a GitHub release, the only channel today. Check the file against `SHA256SUMS`, then open it.',
      systems: [
        { name: 'Windows', text: 'The `setup-unsigned.exe` installer. It is unsigned: choose More info, then Run anyway.' },
        { name: 'macOS', text: 'The `.dmg` or `.zip` for your chip. It is signed ad hoc and not notarized.' },
        { name: 'Linux', text: 'The `.deb` or `.rpm`, or the AppImage. They are unsigned, so the checksum is your check.' },
      ],
      download: 'Download from GitHub',
      install: 'Install ZPLC',
      installTo: '/docs/getting-started/install',
      sourceTitle: 'Open source',
      source: 'ZPLC is MIT-licensed. The runtime, the compiler, the application, the course and this site are in one repository.',
      sourceLinks: [
        { label: 'Repository', href: 'https://github.com/eduardojvieira/ZPLC' },
        { label: 'Contributing', to: '/docs/contributing' },
        { label: 'Release notes', to: '/docs/release-notes' },
        { label: 'Discussions', href: 'https://github.com/eduardojvieira/ZPLC/discussions' },
      ],
    },
  },
  es: {
    home: {
      metaTitle: 'Runtime y entorno de desarrollo de PLC IEC 61131-3, de código abierto',
      metaDescription:
        'ZPLC compila los cinco lenguajes IEC 61131-3 a un solo bytecode. Su runtime en C99 se compila para placas Zephyr y se ' +
        'ejecuta como simulador en su equipo, y su aplicación de escritorio edita, simula y prueba programas.',
    },
    hero: {
      title: 'Runtime y entorno de desarrollo de PLC IEC 61131-3, de código abierto, sobre Zephyr RTOS.',
      lead: 'Programe, simule y verifique lógica de control IEC 61131-3 determinista.',
      download: 'Descargar',
      downloadHref: releasesUrl,
      start: 'Primeros pasos',
      startTo: '/docs/getting-started',
      artAlt:
        'Ilustración: un peldaño de diagrama de escalera dibujado como esquema, cableado a los bornes de un módulo controlador ' +
        'genérico sobre un riel DIN; el camino hasta una salida está resaltado.',
      statusLabel: 'Versión preliminar',
      status: 'La versión 2.0 es para evaluación. Ninguna placa se ha probado con hardware, y ZPLC no debe controlar maquinaria.',
      statusLink: 'Seguridad y limitaciones',
      statusTo: '/docs/safety-and-limitations',
    },
    different: {
      title: 'Lo que distingue a ZPLC',
      lead: 'Las partes de ZPLC que lo diferencian, cada una con la página que muestra cómo se comprueba.',
      port: {
        title: 'Un microcontrolador nuevo necesita 18 funciones',
        text:
          'El runtime es C99 portable detrás de una capa de abstracción de hardware. Un port implementa sus 18 funciones y dos ' +
          'llamadas de red opcionales, y luego pasa la suite de conformidad de ports: cada código de operación, los rechazos del ' +
          'cargador, las fases y fallas del planificador, la temporización, la E/S y el almacenamiento.',
        targetsTitle: 'Ports en el repositorio',
        targets: [
          {
            name: 'Zephyr RTOS',
            text:
              'Siete perfiles de placa con chips RP2040, STM32 y ESP32-S3 se compilan en CI. La suite de conformidad se ejecuta ' +
              'en `native_sim` y en QEMU Cortex-M3 y M0. Ninguna placa se ha probado todavía con hardware.',
          },
          {
            name: 'Host POSIX',
            text: 'El simulador de la aplicación ZPLC es este port, compilado desde las mismas fuentes en C.',
          },
          { name: 'FreeRTOS', text: 'Compilado y probado con la suite de conformidad en el simulador POSIX de FreeRTOS, en CI.' },
        ],
        stripTitle: 'La capa de abstracción de hardware',
        groups: {
          clock: 'Reloj',
          io: 'Tabla de E/S',
          storage: 'Almacenamiento',
          locks: 'Bloqueos',
          life: 'Registro y ciclo de vida',
          network: 'Red, opcional',
        },
        links: [
          { label: 'Interfaz de port y suite de conformidad', to: '/docs/runtime/port-interface' },
          { label: 'Portar a una placa', to: '/docs/guides/port-to-a-board' },
        ],
      },
      rungs: [
        {
          title: 'Simule antes de usar hardware',
          text:
            'El simulador es el mismo runtime en C, compilado para su equipo e incluido con ZPLC. Las pruebas de escenario fijan ' +
            'entradas y verifican salidas en el tiempo, desde la pestaña Pruebas o con `zplc-cli` en un trabajo de CI.',
          link: 'Pruebas de escenario',
          to: '/docs/guides/scenario-tests',
        },
        {
          title: 'Observe, fuerce y avance en línea',
          text:
            'En los cinco lenguajes: valores sobre el programa mientras se ejecuta, puntos de interrupción, pausa y avance de un ' +
            'ciclo, y valores forzados que siguen marcados como forzados.',
          link: 'Simular y depurar',
          to: '/docs/guides/simulate-and-debug',
        },
        {
          title: 'Un ciclo en un orden fijo',
          text:
            'Las tareas liberadas juntas se ejecutan por instante de liberación, luego por prioridad y luego por ID de tarea, ' +
            'sobre una sola instantánea de las entradas. Un programa tiene hasta 16 tareas, cada una con su intervalo. El ' +
            'intervalo es un plazo; ninguna placa tiene todavía un tiempo de ciclo medido.',
          link: 'Planificador',
          to: '/docs/runtime/scheduler',
          timing: true,
        },
        {
          title: 'Una persona inicia cada acción física',
          text:
            'Learn y el servidor MCP para asistentes de IA nunca graban firmware, despliegan, fuerzan, ni inician o detienen un ' +
            'programa. Lo hace una persona, con los controles de ZPLC.',
          link: 'Asistentes de IA y MCP',
          to: '/docs/guides/ai-and-mcp',
        },
        {
          title: 'Bloques de comunicación',
          text:
            'Bloques de función para Modbus, MQTT con Sparkplug B y servicios en la nube. Se comprueban contra servidores ' +
            'escritos para las pruebas en este equipo, todavía no contra un broker real ni un dispositivo en un cable.',
          link: 'Bloques de función de comunicación',
          to: '/docs/runtime/communication-function-blocks',
        },
        {
          title: 'Inglés y español',
          text: 'La aplicación, las 33 lecciones y esta documentación, en inglés y en español neutro.',
          link: 'Primeros pasos',
          to: '/docs/getting-started',
        },
      ],
      timing: {
        caption: 'El orden de un ciclo, sin escala',
        rows: ['Leer entradas', 'Ejecutar tareas', 'Escribir salidas'],
      },
    },
    languages: {
      title: 'Cinco lenguajes IEC 61131-3, un solo bytecode',
      lead:
        'Escriba en texto o en diagramas. Todos los lenguajes se compilan al mismo bytecode `.zplc`, que ejecuta un único ' +
        'runtime en C99.',
      tabsLabel: 'Lenguajes IEC 61131-3',
      evidenceLabel: 'Cómo se comprueba',
      evidence:
        'Para cada lenguaje, una prueba de extremo a extremo de ZPLC edita, compila, simula, depura, fuerza y despliega un ' +
        'programa. El despliegue va al runtime nativo detrás de una placa emulada; no interviene ninguna placa física.',
      evidenceLink: 'Los lenguajes y su evidencia',
      evidenceTo: '/docs/languages',
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
    learn: {
      title: 'Aprenda programación de PLC en ZPLC',
      lead:
        'Un curso de 33 lecciones en 12 módulos, del ciclo de un PLC a una máquina pequeña, en inglés y en español. ZPLC califica ' +
        'cada lección, y todas menos una se ejecutan en el simulador, sin placa y sin red.',
      facts: [
        {
          title: 'Calificada con un escenario',
          text:
            'Comprobar ejecuta su programa guardado contra el escenario de la lección y lista cada aserción que falló, con el ' +
            'instante, el valor esperado y el valor observado.',
        },
        {
          title: 'Dos recorridos',
          text:
            'Todas las lecciones menos una se ejecutan en simulación. 21 de ellas llevan además la lección a una placa del estudiante, ' +
            'con el cableado en un ' +
            'diagrama y un mapa de pines; todavía no se ha registrado ninguna comprobación en una placa.',
        },
        {
          title: 'Cuatro plantas simuladas',
          text: 'Un tanque, una cinta transportadora, un motor y un cruce peatonal responden a las salidas de su programa.',
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
    architecture: {
      title: 'De un peldaño a un pin',
      lead:
        'ZPLC compila cada lenguaje a bytecode `.zplc`. Una máquina virtual en C99 lo ejecuta, y la capa de abstracción de ' +
        'hardware lo conecta con la plataforma.',
      app: 'Aplicación ZPLC: editar, compilar, simular, probar, desplegar, monitorear',
      stages: [
        { title: 'Fuente', items: ['ST', 'IL', 'LD', 'FBD', 'SFC'] },
        { title: 'Compilador', items: ['TypeScript', '`packages/zplc-compiler`'] },
        { title: 'Bytecode', items: ['`.zplc`', 'verificado por el cargador'] },
        { title: 'Runtime', items: ['máquina virtual en C99', 'planificador, imagen de proceso'] },
        { title: 'HAL', items: ['18 funciones', '2 opcionales'] },
      ],
      ports: [
        { name: 'Zephyr RTOS', note: '7 perfiles de placa, cross-build' },
        { name: 'Host POSIX', note: 'el simulador de ZPLC' },
        { name: 'FreeRTOS', note: 'simulador POSIX, en CI' },
      ],
      links: [
        { label: 'Runtime', to: '/docs/runtime' },
        { label: 'Conjunto de instrucciones', to: '/docs/runtime/isa' },
        { label: 'Contrato de la HAL', to: '/docs/runtime/hal-contract' },
        { label: 'Arquitectura del sistema', to: '/docs/architecture' },
      ],
    },
    boards: {
      title: 'Placas, en el nivel que da su evidencia',
      lead:
        'Siete perfiles de placa de Zephyr se compilan en CI y caben en sus presupuestos de flash y RAM. Ninguno se ha grabado, ' +
        'arrancado ni ejecutado todavía en hardware; el nivel siguiente necesita una prueba registrada en la placa exacta.',
      levels: [
        { id: 'cross-build', text: 'El firmware compila para la placa y cabe en su presupuesto de flash y RAM.' },
        { id: 'community-reported', text: 'Un usuario informó qué ocurrió en su propia placa, con la imagen que ejecutó.' },
        {
          id: 'human-hil',
          text: 'Una persona ejecutó un procedimiento registrado en la placa exacta, con la imagen identificada por commit y hash.',
        },
        { id: 'production-qualified', text: 'Existe un paquete de evidencia de producción gobernado por separado.' },
      ],
      columns: { board: 'Placa', target: 'Destino de Zephyr', network: 'Red', level: 'Nivel' },
      learner: 'Placa del estudiante del curso',
      links: [
        { label: 'Placas', to: '/docs/reference/boards' },
        { label: 'Compatibilidad de hardware', to: '/docs/reference/capabilities-evidence' },
      ],
    },
    limits: {
      title: 'Lo que ZPLC no es',
      items: [
        'No es un PLC de seguridad, y ninguna de sus partes se ha certificado ni evaluado frente a una norma de seguridad funcional.',
        'No debe controlar maquinaria ni proteger personas: ni como parada de emergencia, ni como enclavamiento, ni como resguardo.',
        'No garantiza tiempos: ninguna placa tiene un tiempo de ciclo, una fluctuación ni un peor caso de ejecución medidos.',
        'La versión 2.0 es preliminar, para evaluación, y ninguna placa supera el nivel que dan sus registros.',
      ],
      link: 'Seguridad y limitaciones',
      to: '/docs/safety-and-limitations',
    },
    get: {
      title: 'Obtenga ZPLC',
      lead:
        'Los instaladores son archivos de una versión publicada en GitHub, el único canal hoy. Verifique el archivo con ' +
        '`SHA256SUMS` y luego ábralo.',
      systems: [
        {
          name: 'Windows',
          text: 'El instalador `setup-unsigned.exe`. No está firmado: elija Más información y luego Ejecutar de todas formas.',
        },
        { name: 'macOS', text: 'El `.dmg` o el `.zip` para su chip. Tiene una firma ad hoc y no está notarizado.' },
        { name: 'Linux', text: 'El `.deb` o el `.rpm`, o la AppImage. No están firmados, así que la suma de verificación es su control.' },
      ],
      download: 'Descargar desde GitHub',
      install: 'Instalar ZPLC',
      installTo: '/docs/getting-started/install',
      sourceTitle: 'Código abierto',
      source: 'ZPLC tiene licencia MIT. El runtime, el compilador, la aplicación, el curso y este sitio están en un solo repositorio.',
      sourceLinks: [
        { label: 'Repositorio', href: 'https://github.com/eduardojvieira/ZPLC' },
        { label: 'Contribuir', to: '/docs/contributing' },
        { label: 'Notas de la versión', to: '/docs/release-notes' },
        { label: 'Discusiones', href: 'https://github.com/eduardojvieira/ZPLC/discussions' },
      ],
    },
  },
};

/** The content of one locale, with the data that both locales share. */
export function getLandingPageContent(locale) {
  const lang = locale in landingPageContent ? locale : 'en';
  const content = landingPageContent[lang];
  return {
    ...content,
    different: {
      ...content.different,
      port: {
        ...content.different.port,
        groups: halGroups.map((group) => ({ ...group, label: content.different.port.groups[group.key] })),
      },
    },
    languages: {
      ...content.languages,
      items: content.languages.items.map((item, index) => ({
        ...item,
        id: languageIds[index],
        shot: `editors/${languageIds[index]}-${lang}.png`,
        to: `/docs/reference/language-${languageIds[index]}`,
      })),
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
