import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const landingPageContent = {
  en: {
    home: {
      metaTitle: 'ZPLC - Portable PLC Runtime and Studio',
      metaDescription:
        'A portable C99 PLC runtime and engineering IDE for Zephyr and POSIX workflows, with capabilities documented by profile.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'Portable',
      titleAccent: 'PLC Runtime & Studio.',
      subtitle:
        'A portable C99 PLC runtime with a professional desktop IDE. Build and test logic across Zephyr and POSIX workflows, then verify behavior for the target profile you use.',
      primaryCta: 'Download IDE',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Board Profiles',
      secondaryTo: '/docs/reference',
      chips: ['IEC 61131-3 workflows', 'Zephyr RTOS', 'POSIX Native'],
      imageAlt: 'ZPLC IDE and Runtime',
    },
    runtimeSection: {
      label: 'RUNTIME FOUNDATION',
      title: 'Evidence-Gated Execution',
      subtitle:
        'A C99 core and engineering workflow built to make capabilities and evidence explicit.',
      cards: [
        {
          icon: '🛡️',
          title: 'Bounded Memory & State',
          description:
            'Bounded runtime memory and retentive-storage paths available according to the selected target profile.',
        },
        {
          icon: '⏱️',
          title: 'Task Scheduling',
          description:
            'Tasks, priorities, logical budgets, and diagnostics help inspect each runtime workflow; timing evidence is target-specific.',
        },
        {
          icon: '⚡',
          title: 'Portable Architecture',
          description:
            'A bytecode runtime separated from hardware through a HAL, so platform work can be reviewed per profile and revision.',
        },
        {
          icon: '💻',
          title: 'Native Simulation',
          description:
            'Use the POSIX runtime for repeatable host-side logic workflows within its declared capabilities—not as a hardware twin.',
        },
      ],
    },
    architectureSection: {
      label: 'IT MEETS OT',
      title: 'Runtime Boundaries',
      subtitle:
        'Keep execution, device integration, and operational evidence clear at every step.',
      steps: [
        {
          icon: '1',
          title: 'Compile',
          description: 'Compile supported project workflows into `.zplc` bytecode with diagnostics.',
        },
        {
          icon: '2',
          title: 'Simulate',
          description: 'Run supported logical workflows on POSIX and inspect the resulting runtime data.',
        },
        {
          icon: '3',
          title: 'Integrate',
          description: 'Use only the transports and services declared for the selected board profile.',
        },
        {
          icon: '4',
          title: 'Verify',
          description: 'Separate host, target, and HIL evidence before making operational claims.',
        },
      ],
    },
    hardwareSection: {
      label: 'BOARD PROFILES',
      title: 'Catalogued Hardware',
      subtitle:
        'Board entries are catalogued examples. Their support tier and available capabilities vary by exact profile and revision.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H7', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'DevKitC' },
        { value: 'F746', label: 'STM32F746G Discovery' },
        { value: 'H743', label: 'Nucleo-H743ZI' },
      ],
      architectures: 'Catalogued examples: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'MODERN EXPERIENCE',
      title: 'Developer-First Tooling',
      subtitle:
        'Build, inspect, and test with the workflows available for your selected language and runtime profile.',
      languageBlock: {
        title: 'IEC 61131-3 Languages',
        description: 'Structured Text is the central frontend. Visual and IL workflows are available according to their documented workflow evidence.',
        items: ['Ladder Logic (LD)', 'Function Block Diagrams (FBD)', 'Sequential Function Charts (SFC)', 'Structured Text (ST)'],
      },
      referenceBlock: {
        title: 'Professional Workflow',
        items: ['Live variable inspection', 'Controlled runtime stepping', 'Capability-aware debugging', 'Automated test paths'],
      },
    },
    roadmapSection: {
      label: 'CONTINUOUS EVOLUTION',
      title: 'Contracts Built to Evolve',
      subtitle:
        'Core, IDE, and integrations evolve through versioned contracts and evidence recorded for each profile.',
      phases: [
        {
          badge: 'CORE ENGINE',
          title: 'C99 VM Interpreter',
          items: ['Task scheduler and diagnostics', 'Profile-aware persistence', 'Zephyr HAL integration'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'IDE WORKFLOW',
          title: 'Visual Environments',
          items: ['React Flow interface', 'TypeScript compiler', 'POSIX native simulation'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'CONNECTIVITY',
          title: 'Standard Protocols',
          items: ['Profile-declared transports', 'Capability-aware integration', 'Network boundaries'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'ZPLC IDE',
      title: 'Professional Desktop Environment',
      subtitle: 'Visual authoring, compilation, and runtime inspection delivered as a desktop workflow. Availability depends on the released platform and target profile.',
      cards: [
        { icon: '✏️', title: 'Author', description: 'Visual and textual editors in one consistent desktop workflow.' },
        { icon: '🚀', title: 'Simulate', description: 'Test supported logic with the POSIX runtime and its declared host capabilities.' },
        { icon: '📦', title: 'Compile', description: 'Translate supported automation logic into `.zplc` bytecode with diagnostics.' },
        { icon: '🛠️', title: 'Diagnostics', description: 'Inspect runtime state through the controls available for the selected capability profile.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Start Building Automation',
      subtitle: 'Review the documentation, board profiles, and recorded evidence before selecting a workflow.',
      primaryCta: 'Read the Documentation',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'GitHub Repository',
    },
  },
  es: {
    home: {
      metaTitle: 'ZPLC - Runtime PLC Portable y Studio',
      metaDescription:
        'Un runtime PLC C99 portable y un IDE de ingeniería para flujos Zephyr y POSIX, con capacidades documentadas por perfil.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'Runtime PLC',
      titleAccent: 'Portable y Studio.',
      subtitle:
        'Un runtime PLC C99 portable con un IDE de escritorio profesional. Construí y probá lógica en flujos Zephyr y POSIX, y verificá el comportamiento del perfil de destino que uses.',
      primaryCta: 'Descargar IDE',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Perfiles de placa',
      secondaryTo: '/docs/reference',
      chips: ['Flujos IEC 61131-3', 'Zephyr RTOS', 'POSIX Native'],
      imageAlt: 'ZPLC IDE y Runtime',
    },
    runtimeSection: {
      label: 'BASE DEL RUNTIME',
      title: 'Ejecución con evidencia',
      subtitle:
        'Un núcleo C99 y un flujo de ingeniería que hacen explícitas las capacidades y su evidencia.',
      cards: [
        {
          icon: '🛡️',
          title: 'Memoria acotada y estado',
          description:
            'Memoria acotada en el runtime y rutas de almacenamiento retentivo disponibles según el perfil de destino seleccionado.',
        },
        {
          icon: '⏱️',
          title: 'Planificación de tareas',
          description:
            'Tareas, prioridades, presupuestos lógicos y diagnósticos permiten inspeccionar cada flujo; la evidencia de timing depende del destino.',
        },
        {
          icon: '⚡',
          title: 'Arquitectura Portable',
          description:
            'Un runtime de bytecode separado del hardware mediante HAL, para revisar cada plataforma por perfil y revisión.',
        },
        {
          icon: '💻',
          title: 'Simulación nativa',
          description:
            'Usá el runtime POSIX para flujos lógicos repetibles en host dentro de sus capacidades declaradas, no como gemelo de hardware.',
        },
      ],
    },
    architectureSection: {
      label: 'IT CONVERGE A OT',
      title: 'Límites del runtime',
      subtitle:
        'Mantené claras la ejecución, la integración de dispositivos y la evidencia operacional en cada paso.',
      steps: [
        {
          icon: '1',
          title: 'Compilar',
          description: 'Compilá flujos de proyecto soportados a bytecode `.zplc` con diagnósticos.',
        },
        {
          icon: '2',
          title: 'Simular',
          description: 'Ejecutá flujos lógicos soportados en POSIX e inspeccioná los datos de runtime resultantes.',
        },
        {
          icon: '3',
          title: 'Integrar',
          description: 'Usá sólo los transportes y servicios declarados para el perfil de placa seleccionado.',
        },
        {
          icon: '4',
          title: 'Verificar',
          description: 'Separá evidencia host, target y HIL antes de afirmar comportamiento operacional.',
        },
      ],
    },
    hardwareSection: {
      label: 'PERFILES DE PLACA',
      title: 'Hardware catalogado',
      subtitle:
        'Las placas son ejemplos catalogados. El nivel de soporte y las capacidades disponibles varían según el perfil y la revisión exactos.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H7', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'DevKitC' },
        { value: 'F746', label: 'STM32F746G Discovery' },
        { value: 'H743', label: 'Nucleo-H743ZI' },
      ],
      architectures: 'Ejemplos catalogados: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'EXPERIENCIA MODERNA',
      title: 'Herramientas para Desarrolladores',
      subtitle:
        'Construí, inspeccioná y probá con los flujos disponibles para el lenguaje y perfil de runtime que selecciones.',
      languageBlock: {
        title: 'Lenguajes IEC 61131-3',
        description: 'Structured Text es el frontend central. Los flujos visuales e IL están disponibles según su evidencia documentada por workflow.',
        items: ['Ladder Logic (LD)', 'Function Block Diagrams (FBD)', 'Sequential Function Charts (SFC)', 'Structured Text (ST)'],
      },
      referenceBlock: {
        title: 'Flujo de Trabajo Profesional',
        items: ['Inspección de variables en vivo', 'Ejecución controlada por pasos', 'Debug según capacidades', 'Flujos de prueba automatizados'],
      },
    },
    roadmapSection: {
      label: 'EVOLUCIÓN CONTINUA',
      title: 'Contratos preparados para evolucionar',
      subtitle:
        'El core, el IDE y las integraciones evolucionan mediante contratos versionados y evidencia registrada para cada perfil.',
      phases: [
        {
          badge: 'CORE ENGINE',
          title: 'Intérprete VM C99',
          items: ['Scheduler y diagnósticos', 'Persistencia según perfil', 'Integración HAL Zephyr'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'WORKFLOW IDE',
          title: 'Entornos Visuales',
          items: ['Interfaz React Flow', 'Compilador TypeScript', 'Simulación POSIX nativa'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'CONECTIVIDAD',
          title: 'Protocolos Estándar',
          items: ['Transportes declarados por perfil', 'Integración por capacidades', 'Límites de red'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'IDE ZPLC',
      title: 'Entorno de Escritorio Profesional',
      subtitle: 'Creación visual, compilación e inspección de runtime como flujo de escritorio. La disponibilidad depende de la plataforma publicada y del perfil de destino.',
      cards: [
        { icon: '✏️', title: 'Diseñar', description: 'Editores visuales y textuales en un flujo de escritorio consistente.' },
        { icon: '🚀', title: 'Simular', description: 'Probá lógica soportada con el runtime POSIX y sus capacidades host declaradas.' },
        { icon: '📦', title: 'Compilar', description: 'Traducí lógica de automatización soportada a bytecode `.zplc` con diagnósticos.' },
        { icon: '🛠️', title: 'Diagnosticar', description: 'Inspeccioná estado de runtime mediante los controles disponibles para el perfil de capacidades seleccionado.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Comienza a automatizar',
      subtitle: 'Revisá la documentación, los perfiles de placa y la evidencia registrada antes de elegir un flujo.',
      primaryCta: 'Leer la Documentación',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Repositorio GitHub',
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
