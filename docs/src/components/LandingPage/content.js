import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const releasesUrl = 'https://github.com/eduardojvieira/ZPLC/releases';

const landingPageContent = {
  en: {
    home: {
      metaTitle: 'ZPLC - Open-source PLC runtime and IDE',
      metaDescription:
        'An open-source IEC 61131-3 PLC runtime in portable C99 and a desktop IDE to write, test and simulate programs.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'Open-source',
      titleAccent: 'PLC runtime and IDE.',
      subtitle:
        'Write IEC 61131-3 programs, test them with scenarios and run them in a simulator on your computer. The same C99 runtime builds for Zephyr boards. Version 2.0 is a preview: no board has been tested on hardware yet.',
      primaryCta: 'Download the prerelease',
      primaryTo: releasesUrl,
      secondaryCta: 'Get started',
      secondaryTo: '/docs/getting-started',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'MIT licence'],
    },
    runtimeSection: {
      label: 'RUNTIME',
      title: 'A small C99 runtime',
      subtitle: 'One bytecode runtime, separated from the hardware by a HAL.',
      cards: [
        {
          icon: '🛡️',
          title: 'Fixed memory regions',
          description:
            'Programs work in five fixed regions: inputs, outputs, work, retain and code. Their sizes are set at build time.',
        },
        {
          icon: '⏱️',
          title: 'Tasks and priorities',
          description:
            'Programs run in tasks with a priority and a cycle time. Timing on a board has not been measured yet.',
        },
        {
          icon: '⚡',
          title: 'Portable core',
          description:
            'The core reaches the platform only through a HAL. The Zephyr and POSIX ports are included in this release.',
        },
        {
          icon: '💻',
          title: 'Native simulation',
          description:
            'Run a program on your computer with the same C runtime. The simulator does not model a board’s I/O or its real timing.',
        },
      ],
    },
    architectureSection: {
      label: 'WORKFLOW',
      title: 'From source to runtime',
      subtitle: 'Write, compile, simulate, then deploy to a board.',
      steps: [
        {
          icon: '1',
          title: 'Compile',
          description: 'Compile a project to `.zplc` bytecode and read the compiler diagnostics.',
        },
        {
          icon: '2',
          title: 'Simulate',
          description: 'Run the program on the POSIX runtime and watch its variables.',
        },
        {
          icon: '3',
          title: 'Test',
          description: 'Run scenarios: scripted inputs with timed checks on the outputs.',
        },
        {
          icon: '4',
          title: 'Deploy',
          description: 'Send the program to a connected board. A person starts every deploy.',
        },
      ],
    },
    hardwareSection: {
      label: 'BOARDS',
      title: 'Seven board profiles',
      subtitle: 'All seven cross-build in CI. None has been tested on hardware yet.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H747', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'ESP32-S3 DevKitC' },
        { value: 'STM32F746', label: 'STM32F746G Discovery' },
        { value: 'STM32H743', label: 'Nucleo-H743ZI' },
        { value: 'STM32H747', label: 'Arduino Opta WiFi' },
        { value: 'RP2040', label: 'Waveshare RP2040-Zero' },
      ],
      architectures: 'Evidence level for every board: cross-build',
    },
    documentationSection: {
      label: 'LANGUAGES AND TOOLS',
      title: 'Languages and debugging',
      subtitle: 'Edit in text or in diagrams, then run and inspect the program.',
      languageBlock: {
        title: 'IEC 61131-3 languages',
        description: 'Structured Text is the main path. Instruction List is a text path. Ladder, Function Block Diagram and Sequential Function Chart have visual editors.',
        items: ['Structured Text (ST)', 'Instruction List (IL)', 'Ladder Diagram (LD)', 'Function Block Diagram (FBD)', 'Sequential Function Chart (SFC)'],
      },
      referenceBlock: {
        title: 'Run and inspect',
        items: ['Watch variables while a program runs', 'Step one cycle at a time', 'Scenario tests on the simulator', 'Trace of recorded values'],
      },
    },
    roadmapSection: {
      label: 'IN THE REPOSITORY',
      title: 'Three parts',
      subtitle: 'The runtime, the Studio app and the function blocks for communication.',
      phases: [
        {
          badge: 'RUNTIME',
          title: 'C99 VM',
          items: ['Task scheduler and diagnostics', 'Zephyr and POSIX HALs', 'Loader that verifies programs'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'STUDIO',
          title: 'Desktop app',
          items: ['Text and visual editors', 'TypeScript compiler', 'Native POSIX simulation'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'COMMUNICATION',
          title: 'Function blocks',
          items: ['Modbus', 'MQTT', 'Azure and AWS cloud blocks'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'ZPLC STUDIO',
      title: 'Desktop app for Windows, macOS and Linux',
      subtitle: 'Edit, compile, simulate and test in one place. The installers of this prerelease are unsigned.',
      cards: [
        { icon: '✏️', title: 'Author', description: 'A text editor for ST and IL, and visual editors for LD, FBD and SFC.' },
        { icon: '🚀', title: 'Simulate', description: 'Run a program on the bundled POSIX runtime and watch its variables.' },
        { icon: '📦', title: 'Compile', description: 'Compile a project to `.zplc` bytecode and read the diagnostics.' },
        { icon: '🛠️', title: 'Test', description: 'Run scenario tests and look at the trace they record.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Try ZPLC',
      subtitle: 'Download the prerelease, copy an example project and run it in the simulator.',
      primaryCta: 'Read Getting Started',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'GitHub Repository',
    },
  },
  es: {
    home: {
      metaTitle: 'ZPLC - Runtime y IDE para PLC de código abierto',
      metaDescription:
        'Un runtime PLC IEC 61131-3 de código abierto en C99 portable y un IDE de escritorio para escribir, probar y simular programas.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'Runtime e IDE para PLC',
      titleAccent: 'de código abierto.',
      subtitle:
        'Escriba programas IEC 61131-3, pruébelos con escenarios y ejecútelos en un simulador en su equipo. El mismo runtime en C99 se compila para placas Zephyr. La versión 2.0 es preliminar: todavía no se ha probado ninguna placa con hardware.',
      primaryCta: 'Descargar la versión preliminar',
      primaryTo: releasesUrl,
      secondaryCta: 'Primeros pasos',
      secondaryTo: '/docs/getting-started',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'Licencia MIT'],
    },
    runtimeSection: {
      label: 'RUNTIME',
      title: 'Un runtime pequeño en C99',
      subtitle: 'Un solo runtime de bytecode, separado del hardware mediante una HAL.',
      cards: [
        {
          icon: '🛡️',
          title: 'Regiones de memoria fijas',
          description:
            'Los programas trabajan en cinco regiones fijas: entradas, salidas, trabajo, retain y código. Sus tamaños se definen al compilar.',
        },
        {
          icon: '⏱️',
          title: 'Tareas y prioridades',
          description:
            'Los programas se ejecutan en tareas con prioridad y tiempo de ciclo. Los tiempos en una placa todavía no se han medido.',
        },
        {
          icon: '⚡',
          title: 'Núcleo portable',
          description:
            'El núcleo accede a la plataforma solo mediante una HAL. Esta versión incluye los ports de Zephyr y POSIX.',
        },
        {
          icon: '💻',
          title: 'Simulación nativa',
          description:
            'Ejecute un programa en su equipo con el mismo runtime en C. El simulador no modela la E/S de una placa ni sus tiempos reales.',
        },
      ],
    },
    architectureSection: {
      label: 'FLUJO DE TRABAJO',
      title: 'Del código fuente al runtime',
      subtitle: 'Escribir, compilar, simular y luego desplegar en una placa.',
      steps: [
        {
          icon: '1',
          title: 'Compilar',
          description: 'Compile un proyecto a bytecode `.zplc` y lea los diagnósticos del compilador.',
        },
        {
          icon: '2',
          title: 'Simular',
          description: 'Ejecute el programa en el runtime POSIX y observe sus variables.',
        },
        {
          icon: '3',
          title: 'Probar',
          description: 'Ejecute escenarios: entradas definidas con verificaciones temporizadas sobre las salidas.',
        },
        {
          icon: '4',
          title: 'Desplegar',
          description: 'Envíe el programa a una placa conectada. Una persona inicia cada despliegue.',
        },
      ],
    },
    hardwareSection: {
      label: 'PLACAS',
      title: 'Siete perfiles de placa',
      subtitle: 'Las siete se compilan en CI. Ninguna se ha probado todavía con hardware.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H747', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'ESP32-S3 DevKitC' },
        { value: 'STM32F746', label: 'STM32F746G Discovery' },
        { value: 'STM32H743', label: 'Nucleo-H743ZI' },
        { value: 'STM32H747', label: 'Arduino Opta WiFi' },
        { value: 'RP2040', label: 'Waveshare RP2040-Zero' },
      ],
      architectures: 'Nivel de evidencia de todas las placas: cross-build',
    },
    documentationSection: {
      label: 'LENGUAJES Y HERRAMIENTAS',
      title: 'Lenguajes y depuración',
      subtitle: 'Edite en texto o en diagramas, y luego ejecute e inspeccione el programa.',
      languageBlock: {
        title: 'Lenguajes IEC 61131-3',
        description: 'Structured Text es la vía principal. Instruction List es una vía de texto. Ladder, Function Block Diagram y Sequential Function Chart tienen editores visuales.',
        items: ['Structured Text (ST)', 'Instruction List (IL)', 'Ladder Diagram (LD)', 'Function Block Diagram (FBD)', 'Sequential Function Chart (SFC)'],
      },
      referenceBlock: {
        title: 'Ejecutar e inspeccionar',
        items: ['Observar variables mientras el programa se ejecuta', 'Avanzar un ciclo a la vez', 'Pruebas de escenario en el simulador', 'Trace de los valores registrados'],
      },
    },
    roadmapSection: {
      label: 'EN EL REPOSITORIO',
      title: 'Tres partes',
      subtitle: 'El runtime, la aplicación Studio y los bloques de función de comunicación.',
      phases: [
        {
          badge: 'RUNTIME',
          title: 'VM en C99',
          items: ['Planificador de tareas y diagnósticos', 'HAL de Zephyr y de POSIX', 'Cargador que verifica los programas'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'STUDIO',
          title: 'Aplicación de escritorio',
          items: ['Editores de texto y visuales', 'Compilador en TypeScript', 'Simulación POSIX nativa'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'COMUNICACIÓN',
          title: 'Bloques de función',
          items: ['Modbus', 'MQTT', 'Bloques de nube de Azure y AWS'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'ZPLC STUDIO',
      title: 'Aplicación de escritorio para Windows, macOS y Linux',
      subtitle: 'Edite, compile, simule y pruebe en un solo lugar. Los instaladores de esta versión preliminar no están firmados.',
      cards: [
        { icon: '✏️', title: 'Editar', description: 'Un editor de texto para ST e IL, y editores visuales para LD, FBD y SFC.' },
        { icon: '🚀', title: 'Simular', description: 'Ejecute un programa en el runtime POSIX incluido y observe sus variables.' },
        { icon: '📦', title: 'Compilar', description: 'Compile un proyecto a bytecode `.zplc` y lea los diagnósticos.' },
        { icon: '🛠️', title: 'Probar', description: 'Ejecute pruebas de escenario y revise el trace que registran.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Pruebe ZPLC',
      subtitle: 'Descargue la versión preliminar, copie un proyecto de ejemplo y ejecútelo en el simulador.',
      primaryCta: 'Leer Primeros pasos',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Repositorio en GitHub',
    },
  },
};

export function getLandingPageContent(locale) {
  return landingPageContent[locale] ?? landingPageContent.en;
}

export function useLandingPageContent() {
  const { i18n } = useDocusaurusContext();
  return getLandingPageContent(i18n.currentLocale);
}
