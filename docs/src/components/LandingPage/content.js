import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const landingPageContent = {
  en: {
    home: {
      metaTitle: 'ZPLC - The Modern IEC 61131-3 Runtime',
      metaDescription:
        'A deterministic, portable PLC runtime powered by Zephyr RTOS. Industrial quality automation with a professional modern IDE.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'The Modern',
      titleAccent: 'IEC 61131-3 Runtime.',
      subtitle:
        'A deterministic, hardware-agnostic PLC runtime built on Zephyr RTOS with a professional desktop IDE. Write your logic once, deploy it anywhere—from resource-constrained microcontrollers to POSIX-based bare-metal SoftPLCs.',
      primaryCta: 'Download IDE',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'View Supported Hardware',
      secondaryTo: '/docs/reference',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'POSIX Native'],
      imageAlt: 'ZPLC IDE and Runtime',
    },
    runtimeSection: {
      label: 'INDUSTRIAL QUALITY',
      title: 'Sub-millisecond Determinism',
      subtitle:
        'A highly optimized C99 core built to satisfy mission-critical constraints.',
      cards: [
        {
          icon: '🛡️',
          title: 'Memory Safety & State',
          description:
            'Built with robust constraints in mind, featuring retentive memory handling for absolute state persistence between reboots.',
        },
        {
          icon: '⏱️',
          title: 'Real-time Execution',
          description:
            'Sub-millisecond jitter and a strict multitask deterministic scheduler powered entirely by Zephyr RTOS.',
        },
        {
          icon: '⚡',
          title: 'Portable Architecture',
          description:
            'A lightweight core that interprets pre-compiled logic blocks and functions perfectly, entirely abstracting away the hardware layer.',
        },
        {
          icon: '💻',
          title: 'SoftPLC Ready',
          description:
            'Advanced POSIX native runtime support capabilities for cycle-accurate hardware simulation and frictionless deployment on servers.',
        },
      ],
    },
    architectureSection: {
      label: 'IT MEETS OT',
      title: 'Connectivity & Communication',
      subtitle:
        'Bridge the gap between operational technology operations and the cloud natively.',
      steps: [
        {
          icon: '1',
          title: 'Logic Execution',
          description: 'Standard IEC 61131-3 blocks dynamically govern the process image state.',
        },
        {
          icon: '2',
          title: 'Modbus TCP/RTU',
          description: 'Zero-overhead, high-performance Modbus servers actively exposed for SCADA and HMI integration.',
        },
        {
          icon: '3',
          title: 'MQTT Integration',
          description: 'Native MQTT telemetry fired directly from the core runtime to local or remote brokers.',
        },
        {
          icon: '4',
          title: 'Cloud Dashboarding',
          description: 'Achieve complete IT integration without ever relying on complex middleware layers.',
        },
      ],
    },
    hardwareSection: {
      label: 'HARDWARE AGNOSTIC',
      title: 'Support & Extensibility',
      subtitle:
        'Deploy instantly to industrial-grade boards or effortlessly port the runtime to your own custom architecture utilizing the Zephyr device tree.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H7', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'DevKitC' },
        { value: 'F746', label: 'STM32F746G Discovery' },
        { value: 'H743', label: 'Nucleo-H743ZI' },
      ],
      architectures: 'Out-of-the-box support: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'MODERN EXPERIENCE',
      title: 'Developer-First Tooling',
      subtitle:
        'We provide absolutely everything you need to engineer next-generation automation intelligently.',
      languageBlock: {
        title: 'IEC 61131-3 Languages',
        description: 'Enjoy first-class support for industry standard languages designed to match your specific workflow needs.',
        items: ['Ladder Logic (LD)', 'Function Block Diagrams (FBD)', 'Sequential Function Charts (SFC)', 'Structured Text (ST)'],
      },
      referenceBlock: {
        title: 'Professional Workflow',
        items: ['Live variable watch tables', 'Cycle-accurate step execution', 'Hardware breakpoints support', 'Automated testing paths'],
      },
    },
    roadmapSection: {
      label: 'CONTINUOUS EVOLUTION',
      title: 'Built to Scale Natively',
      subtitle:
        'An uncompromising runtime architecture designed from the ground up for continuous improvement and integration.',
      phases: [
        {
          badge: 'CORE ENGINE',
          title: 'C99 VM Interpreter',
          items: ['Strict deterministic scheduler', 'Retentive NVRAM handling', 'Seamless Zephyr HAL integration'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'IDE WORKFLOW',
          title: 'Visual Environments',
          items: ['React Flow powered interface', 'Fast TypeScript compiler', 'POSIX native simulation'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'CONNECTIVITY',
          title: 'Standard Protocols',
          items: ['Unified Modbus TCP/RTU', 'Native IoT edge MQTT client', 'Networking security layers'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'ZPLC IDE',
      title: 'Professional Desktop Environment',
      subtitle: 'Seamless visual authoring, compilation, and remote deployment delivered as a standalone app across Windows, macOS, and Linux.',
      cards: [
        { icon: '✏️', title: 'Author', description: 'Visual and textual editors providing a modern, incredibly responsive development experience.' },
        { icon: '🚀', title: 'Simulate', description: 'Test logic safely using the integrated POSIX native runtime for a precise match of actual hardware behavior.' },
        { icon: '📦', title: 'Compile', description: 'Translate your automation logic directly into highly optimized bytecode blocks instantly.' },
        { icon: '🛠️', title: 'Diagnostics', description: 'Monitor the process image in real-time, inspect internal states, and override variables seamlessly.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Start Building Automation',
      subtitle: 'Join the next generation of industrial control systems powered by modern open standards.',
      primaryCta: 'Read the Documentation',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'GitHub Repository',
    },
  },
  es: {
    home: {
      metaTitle: 'ZPLC - El Runtime Moderno IEC 61131-3',
      metaDescription:
        'Un runtime PLC determinista y portable impulsado por Zephyr RTOS. Calidad industrial con un IDE profesional y moderno.',
    },
    hero: {
      badge: 'ZPLC',
      titleLead: 'El Runtime Moderno',
      titleAccent: 'IEC 61131-3.',
      subtitle:
        'Un entorno de ejecución PLC determinista y agnóstico al hardware construido sobre Zephyr RTOS con un IDE de escritorio profesional. Escribe tu lógica una vez y despliégala donde sea: desde microcontroladores con recursos limitados hasta SoftPLCs bare-metal basados en POSIX.',
      primaryCta: 'Descargar IDE',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Ver Hardware Soportado',
      secondaryTo: '/docs/reference',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'POSIX Native'],
      imageAlt: 'ZPLC IDE y Runtime',
    },
    runtimeSection: {
      label: 'CALIDAD INDUSTRIAL',
      title: 'Determinismo Sub-milisegundo',
      subtitle:
        'Un núcleo C99 altamente optimizado, construido para satisfacer restricciones de misión crítica.',
      cards: [
        {
          icon: '🛡️',
          title: 'Seguridad de Memoria y Estado',
          description:
            'Construido pensando en requerimientos robustos, con manejo de memoria retentiva para persistencia absoluta del estado entre reinicios.',
        },
        {
          icon: '⏱️',
          title: 'Ejecución en Tiempo Real',
          description:
            'Jitter sub-milisegundo y un estricto planificador determinista multitarea impulsado completamente por Zephyr RTOS.',
        },
        {
          icon: '⚡',
          title: 'Arquitectura Portable',
          description:
            'Un núcleo ágil que interpreta bloques y funciones lógicas precompiladas de forma perfecta, abstrayendo completamente la capa de hardware.',
        },
        {
          icon: '💻',
          title: 'Listo para SoftPLC',
          description:
            'Capacidades avanzadas con el runtime nativo POSIX para simulación de hardware de ciclo exacto y despliegue sin fricciones en servidores.',
        },
      ],
    },
    architectureSection: {
      label: 'IT CONVERGE A OT',
      title: 'Conectividad y Comunicación',
      subtitle:
        'Cerrando la brecha entre la tecnología operacional y la nube de forma nativa.',
      steps: [
        {
          icon: '1',
          title: 'Ejecución Lógica',
          description: 'Bloques estándar IEC 61131-3 gobiernan dinámicamente el estado del proceso.',
        },
        {
          icon: '2',
          title: 'Modbus TCP/RTU',
          description: 'Servidores Modbus de alto rendimiento y cero sobrecarga expuestos para integración con SCADA y HMI.',
        },
        {
          icon: '3',
          title: 'Integración MQTT',
          description: 'Telemetría MQTT nativa enviada directamente desde el engine principal a brokers locales o remotos.',
        },
        {
          icon: '4',
          title: 'Dashboarding Cloud',
          description: 'Logre una integración TI completa sin depender jamás de complejas capas de middleware informático.',
        },
      ],
    },
    hardwareSection: {
      label: 'AGNÓSTICO AL HARDWARE',
      title: 'Soporte y Extensibilidad',
      subtitle:
        'Despliega instantáneamente a placas de grado industrial o porta fácilmente el framework a tu propia arquitectura personalizada utilizando el device tree de Zephyr.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico' },
        { value: 'STM32H7', label: 'Arduino GIGA R1' },
        { value: 'ESP32-S3', label: 'DevKitC' },
        { value: 'F746', label: 'STM32F746G Discovery' },
        { value: 'H743', label: 'Nucleo-H743ZI' },
      ],
      architectures: 'Soporte inmediato: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'EXPERIENCIA MODERNA',
      title: 'Herramientas para Desarrolladores',
      subtitle:
        'Proveemos absolutamente todo lo que necesitas para diseñar la automatización inteligente del futuro.',
      languageBlock: {
        title: 'Lenguajes IEC 61131-3',
        description: 'Disfruta de soporte de primera clase para los lenguajes estándar de la industria, diseñados para adaptarse a tus necesidades.',
        items: ['Ladder Logic (LD)', 'Function Block Diagrams (FBD)', 'Sequential Function Charts (SFC)', 'Structured Text (ST)'],
      },
      referenceBlock: {
        title: 'Flujo de Trabajo Profesional',
        items: ['Tablas de monitoreo de variables en vivo', 'Ejecución paso a paso de ciclo exacto', 'Soporte para breakpoints en hardware', 'Flujos de automatización C99'],
      },
    },
    roadmapSection: {
      label: 'EVOLUCIÓN CONTINUA',
      title: 'Construido para Escalar Nativamente',
      subtitle:
        'Una arquitectura de diseño sin concesiones elaborada desde cero para la mejora constante y la integración veloz.',
      phases: [
        {
          badge: 'CORE ENGINE',
          title: 'Intérprete VM C99',
          items: ['Scheduler fuertemente determinista', 'Despliegue NVRAM retentiva', 'Sinergia absoluta con el HAL Zephyr'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'WORKFLOW IDE',
          title: 'Entornos Visuales',
          items: ['Interfaz responsiva React Flow', 'Compilador TypeScript ultrarrápido', 'Simulación POSIX nativa'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'CONECTIVIDAD',
          title: 'Protocolos Estándar',
          items: ['Modbus TCP/RTU Unificado', 'Cliente edge MQTT IoT nativo', 'Capas de seguridad en redes'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'IDE ZPLC',
      title: 'Entorno de Escritorio Profesional',
      subtitle: 'Creación visual, compilación y despliegue remoto sin fricciones, distribuido como una aplicación independiente para Windows, macOS y Linux.',
      cards: [
        { icon: '✏️', title: 'Diseñar', description: 'Editores visuales y textuales que brindan una experiencia de desarrollo moderna e increíblemente receptiva.' },
        { icon: '🚀', title: 'Simular', description: 'Mida la lógica de forma segura utilizando el runtime POSIX nativo integrado, emulando con exactitud el hardware físico.' },
        { icon: '📦', title: 'Compilar', description: 'Traduzca su lógica en bloques bytecode altamente optimizados en cuestión de milisegundos.' },
        { icon: '🛠️', title: 'Diagnosticar', description: 'Supervise la imagen de proceso en tiempo real, inspeccione el estado y anule parámetros dinámicamente.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Comienza a automatizar',
      subtitle: 'Únete a la próxima generación de sistemas de control industrial impulsados por los más modernos estándares.',
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
