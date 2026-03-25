import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

const landingPageContent = {
  en: {
    home: {
      metaTitle: 'ZPLC v1.5.0',
      metaDescription:
        'ZPLC v1.5.0 aligns runtime, IDE, supported boards, bilingual documentation, and release evidence around one truthful industrial release.',
    },
    hero: {
      badge: 'v1.5.0',
      titleLead: 'One Core.',
      titleAccent: 'Any Runtime.',
      subtitle:
        'ZPLC v1.5.0 ships as one coordinated product surface: deterministic runtime, IDE workflows, supported-board truth, and bilingual documentation that matches the release evidence.',
      primaryCta: 'Open Quickstart',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Read Release Notes',
      secondaryTo: '/docs/release-notes',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'v1.5.0'],
      imageAlt: 'ZPLC IDE, runtime, and release workflow',
    },
    runtimeSection: {
      label: 'RELEASE FOUNDATION',
      title: 'Truth before marketing',
      subtitle:
        'Every v1.5.0 claim must survive the same test: code, docs, and evidence all say the same thing.',
      cards: [
        {
          icon: '🧭',
          title: 'Canonical quickstart',
          description:
            'The getting-started path now stays anchored to what a clean checkout can really install, compile, simulate, deploy, and verify.',
        },
        {
          icon: '🛡️',
          title: 'Deterministic runtime',
          description:
            'The release story stays anchored to the C99 VM, the HAL contract, deterministic scheduling, and the memory rules exposed by the public headers.',
        },
        {
          icon: '🧱',
          title: 'Supported boards from one manifest',
          description:
            'Board claims come from the v1.5.0 supported-board JSON, not from stale prose or wishful screenshots.',
        },
        {
          icon: '📚',
          title: 'Bilingual by default',
          description:
            'English and Spanish must move together for every release-blocking page, including reference and release-note surfaces.',
        },
      ],
    },
    architectureSection: {
      label: 'INFORMATION ARCHITECTURE',
      title: 'From source code to release documentation',
      subtitle:
        'The website now mirrors the actual release train: source of truth, product surfaces, and verification gates.',
      steps: [
        {
          icon: '1',
          title: 'Author',
          description: 'Headers, board JSON, IDE packages, and release artifacts define the real claim set.',
        },
        {
          icon: '2',
          title: 'Map',
          description: 'Canonical docs manifest and source-of-truth pages connect every public statement to repo evidence.',
        },
        {
          icon: '3',
          title: 'Validate',
          description: 'Parity and release evidence decide what ships in v1.5.0.',
        },
        {
          icon: '4',
          title: 'Ship',
          description: 'Website, runtime, IDE, and documentation move as one release, not as disconnected demos.',
        },
      ],
    },
    hardwareSection: {
      label: 'SUPPORTED BOARD MATRIX',
      title: 'Board coverage from the canonical manifest',
      subtitle:
        'The website only highlights boards that exist in firmware/app/boards/supported-boards.v1.5.0.json.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico · serial-focused' },
        { value: 'STM32H7', label: 'Arduino GIGA R1 · serial-focused' },
        { value: 'ESP32-S3', label: 'DevKitC · network-capable' },
        { value: 'F746', label: 'STM32F746G Discovery · ethernet' },
        { value: 'H743', label: 'Nucleo-H743ZI · ethernet' },
      ],
      architectures: 'Canonical release boards: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'CANONICAL DOC SURFACES',
      title: 'What must be release-ready',
      subtitle:
        'The v1.5.0 rewrite is structured around release-blocking documentation, not around ad-hoc blog copy.',
      languageBlock: {
        title: 'Release-blocking doc areas',
        description: 'Quickstart, concepts, architecture, IDE, runtime, boards, Zephyr setup, languages, reference, and release notes all need EN/ES parity.',
        items: ['Quickstart & platform overview', 'Architecture, runtime, and HAL contract', 'IDE workflow, compiler, deployment, and debugging', 'Boards, Zephyr setup, generated reference, and release notes'],
      },
      referenceBlock: {
        title: 'Source-backed references',
        items: ['Public runtime headers drive API truth', 'Supported-board JSON drives hardware truth', 'IDE/compiler packages drive workflow truth', 'Release evidence matrix gates what can be claimed publicly'],
      },
    },
    roadmapSection: {
      label: 'V1.5.0 RELEASE TRAIN',
      title: 'Release governance snapshot',
      subtitle:
        'The documentation rewrite is staged so the website lands with the same discipline as the runtime and IDE.',
      phases: [
        {
          badge: 'LANDED',
          title: 'Foundation',
          items: ['New information architecture', 'Release messaging on the landing page', 'Canonical manifest + source-of-truth docs'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'LANDED',
          title: 'Generated references',
          items: ['Runtime API pages from public headers', 'Board reference pages from supported-board JSON', 'Parity, freshness, and semantic validation upgrades'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'NEXT GATES',
          title: 'Release-ready content',
          items: ['Close remaining human-owned release evidence gates', 'Keep boards, protocols, and IDE claims tied to evidence', 'Publish final notes only for verified scope'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'IDE + TOOLCHAIN',
      title: 'The engineering surface that ships with the docs',
      subtitle: 'v1.5.0 treats authoring, compilation, simulation, deployment, and debugging as one documented workflow.',
      cards: [
        { icon: '🧪', title: 'Simulate', description: 'WASM and native runtime paths stay documented as real validation tools, not marketing bullets.' },
        { icon: '⚙️', title: 'Compile', description: 'The compiler workflow is tied to the language support actually exported by the IDE packages.' },
        { icon: '🚚', title: 'Deploy', description: 'Serial and network deployment claims must match supported boards, transports, and evidence.' },
        { icon: '🔎', title: 'Debug', description: 'Breakpoints, watch values, and force flows are documented as release requirements, not optional polish.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Follow the canonical path',
      subtitle: 'Start with the quickstart, verify the manifest, and only ship claims that the repository can prove.',
      primaryCta: 'Browse Documentation',
      primaryTo: '/docs/reference',
      secondaryCta: 'GitHub Repository',
    },
  },
  es: {
    home: {
      metaTitle: 'ZPLC v1.5.0',
      metaDescription:
        'ZPLC v1.5.0 alinea runtime, IDE, placas soportadas, documentación bilingüe y evidencia de release alrededor de un único alcance verificable.',
    },
    hero: {
      badge: 'v1.5.0',
      titleLead: 'Un núcleo.',
      titleAccent: 'Cualquier runtime.',
      subtitle:
        'ZPLC v1.5.0 se publica como una sola superficie de producto: runtime determinista, workflows del IDE, verdad de placas soportadas y documentación bilingüe que coincide con la evidencia del release.',
      primaryCta: 'Abrir guía rápida',
      primaryTo: '/docs/getting-started',
      secondaryCta: 'Leer notas de versión',
      secondaryTo: '/docs/release-notes',
      chips: ['IEC 61131-3', 'Zephyr RTOS', 'v1.5.0'],
      imageAlt: 'IDE, runtime y flujo de release de ZPLC',
    },
    runtimeSection: {
      label: 'BASE DEL RELEASE',
      title: 'Primero la verdad, después el marketing',
      subtitle:
        'Cada claim de v1.5.0 tiene que pasar la misma prueba: código, docs y evidencia dicen exactamente lo mismo.',
      cards: [
        {
          icon: '🧭',
          title: 'Quickstart canónico',
          description:
            'La guía inicial ahora se mantiene anclada a lo que un checkout limpio realmente puede instalar, compilar, simular, desplegar y verificar.',
        },
        {
          icon: '🛡️',
          title: 'Runtime determinista',
          description:
            'La historia del release queda anclada en la VM C99, el contrato HAL, el scheduler determinista y las reglas de memoria expuestas por los headers públicos.',
        },
        {
          icon: '🧱',
          title: 'Placas soportadas desde un único manifiesto',
          description:
            'Los claims de hardware salen del JSON oficial de placas soportadas v1.5.0, no de texto viejo ni capturas aspiracionales.',
        },
        {
          icon: '📚',
          title: 'Bilingüe por defecto',
          description:
            'Inglés y español tienen que avanzar juntos en cada página bloqueante del release, incluyendo referencia y notas de versión.',
        },
      ],
    },
    architectureSection: {
      label: 'ARQUITECTURA DE INFORMACIÓN',
      title: 'Del código fuente a la documentación de release',
      subtitle:
        'Ahora el website refleja el release real: fuentes de verdad, superficies de producto y gates de verificación.',
      steps: [
        {
          icon: '1',
          title: 'Autorizar',
          description: 'Headers, JSON de placas, paquetes del IDE y artefactos de release definen el alcance verdadero.',
        },
        {
          icon: '2',
          title: 'Mapear',
          description: 'El manifiesto canónico y la guía de fuentes de verdad conectan cada mensaje público con evidencia del repo.',
        },
        {
          icon: '3',
          title: 'Validar',
          description: 'La paridad y la evidencia del release deciden qué entra realmente en v1.5.0.',
        },
        {
          icon: '4',
          title: 'Publicar',
          description: 'Website, runtime, IDE y documentación se mueven como un único release, no como demos aisladas.',
        },
      ],
    },
    hardwareSection: {
      label: 'MATRIZ DE PLACAS SOPORTADAS',
      title: 'Cobertura desde el manifiesto canónico',
      subtitle:
        'El website solo resalta placas que existen en firmware/app/boards/supported-boards.v1.5.0.json.',
      boards: [
        { value: 'RP2040', label: 'Raspberry Pi Pico · enfoque serial' },
        { value: 'STM32H7', label: 'Arduino GIGA R1 · enfoque serial' },
        { value: 'ESP32-S3', label: 'DevKitC · con red' },
        { value: 'F746', label: 'STM32F746G Discovery · ethernet' },
        { value: 'H743', label: 'Nucleo-H743ZI · ethernet' },
      ],
      architectures: 'Placas canónicas del release: RP2040 • STM32H747 M7 • ESP32-S3 • STM32F746 • STM32H743ZI',
    },
    documentationSection: {
      label: 'SUPERFICIES DOCUMENTALES CANÓNICAS',
      title: 'Lo que tiene que llegar listo al release',
      subtitle:
        'La reescritura v1.5.0 se organiza alrededor de documentación bloqueante del release, no de copy improvisado.',
      languageBlock: {
        title: 'Áreas documentales bloqueantes',
        description: 'Quickstart, conceptos, arquitectura, IDE, runtime, placas, setup de Zephyr, lenguajes, referencia y notas de versión necesitan paridad EN/ES.',
        items: ['Quickstart y visión general de plataforma', 'Arquitectura, runtime y contrato HAL', 'Workflow del IDE, compilador, despliegue y depuración', 'Placas, setup de Zephyr, referencia generada y notas de versión'],
      },
      referenceBlock: {
        title: 'Referencias respaldadas por fuentes',
        items: ['Los headers públicos del runtime gobiernan la verdad del API', 'El JSON de placas soportadas gobierna la verdad del hardware', 'Los paquetes del IDE/compilador gobiernan la verdad del workflow', 'La matriz de evidencia del release define lo que se puede reclamar públicamente'],
      },
    },
    roadmapSection: {
      label: 'TREN DE RELEASE V1.5.0',
      title: 'Estado de gobernanza del release',
      subtitle:
        'La reescritura documental se entrega por etapas para que el website llegue con la misma disciplina que el runtime y el IDE.',
      phases: [
        {
          badge: 'IMPLEMENTADO',
          title: 'Fundación',
          items: ['Nueva arquitectura de información', 'Mensajería de release en la landing', 'Manifiesto canónico + guía de fuentes de verdad'],
          accentStyle: { border: '1px solid #22d3ee', background: 'rgba(34, 211, 238, 0.05)' },
          badgeStyle: {},
        },
        {
          badge: 'IMPLEMENTADO',
          title: 'Referencias generadas',
          items: ['Páginas de API del runtime desde headers públicos', 'Páginas de placas desde el JSON soportado', 'Mejoras de validación para paridad, frescura y sanidad semántica'],
          accentStyle: {},
          badgeStyle: { color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.2)', background: 'rgba(168, 85, 247, 0.05)' },
        },
        {
          badge: 'GATES SIGUIENTES',
          title: 'Contenido listo para release',
          items: ['Cerrar los gates humanos pendientes de evidencia de release', 'Mantener claims de placas, protocolos e IDE atados a evidencia', 'Publicar notas finales solo para alcance verificado'],
          accentStyle: {},
          badgeStyle: { color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' },
        },
      ],
    },
    ideSection: {
      label: 'IDE + TOOLCHAIN',
      title: 'La superficie de ingeniería que se publica con las docs',
      subtitle: 'v1.5.0 trata autoría, compilación, simulación, despliegue y depuración como un único workflow documentado.',
      cards: [
        { icon: '🧪', title: 'Simular', description: 'Las rutas WASM y native runtime se documentan como herramientas reales de validación, no como bullets de marketing.' },
        { icon: '⚙️', title: 'Compilar', description: 'El workflow del compilador queda atado al soporte de lenguajes realmente exportado por los paquetes del IDE.' },
        { icon: '🚚', title: 'Desplegar', description: 'Los claims de despliegue serial y de red deben coincidir con placas soportadas, transportes y evidencia.' },
        { icon: '🔎', title: 'Depurar', description: 'Breakpoints, watch values y force flows se documentan como requisitos del release, no como opcionales.' },
      ],
      snippet: `PROGRAM Main\nVAR\n  PumpEnabled : BOOL := FALSE;\n  TankLevel : INT := 42;\nEND_VAR\n\nIF TankLevel < 30 THEN\n  PumpEnabled := TRUE;\nEND_IF;\nEND_PROGRAM`,
    },
    ctaSection: {
      title: 'Seguí el camino canónico',
      subtitle: 'Arrancá por el quickstart, verificá el manifiesto y publicá solo claims que el repositorio pueda probar.',
      primaryCta: 'Explorar documentación',
      primaryTo: '/docs/reference',
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
