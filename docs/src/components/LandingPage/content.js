import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

// The text of the landing page, in English and in Spanish. Every claim here is backed by a file of the repository; the list
// is in docs/design/content-outline.md. tools/docs/check_capability_claims.ts and tools/ci/product-name.ts read this file.
// A span between backticks is a literal identifier and is set in code.

const releasesUrl = 'https://github.com/eduardojvieira/ZPLC/releases';

// The numbered regions of the hero capture (docs/static/img/editors/ld-<locale>.png, 1366 x 768), as fractions of its width
// and height; the English and the Spanish captures share the layout. The order is the order of the list beside the picture.
const heroCallouts = [
  { x: '51.2%', y: '23%' },
  { x: '34.4%', y: '31.4%' },
  { x: '22.7%', y: '12.9%' },
  { x: '55.6%', y: '8.5%' },
];

const languageIds = ['st', 'il', 'ld', 'fbd', 'sfc'];

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
      shot: 'editors/ld-en.png',
      shotAlt: 'ZPLC with the Blinky example open in the Ladder Diagram editor.',
      callouts: [
        'Ladder Diagram editor with the Blinky example: four rungs, two timers.',
        'Toolbox: contacts, coils and blocks for the rung.',
        'Project: programs, tasks, I/O mapping, communication and the target device.',
        'Status rail: mode, runtime session and task interval.',
      ],
      provenance: 'Real screenshot, captured from commit',
      statusLabel: 'Prerelease',
      status: 'Version 2.0 is for evaluation. No board has been tested on hardware, and ZPLC must not control machinery.',
      statusLink: 'Safety and limitations',
      statusTo: '/docs/safety-and-limitations',
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
      shot: 'editors/ld-es.png',
      shotAlt: 'ZPLC con el ejemplo Blinky abierto en el editor de diagrama de escalera.',
      callouts: [
        'Editor de diagrama de escalera con el ejemplo Blinky: cuatro peldaños, dos temporizadores.',
        'Caja de herramientas: contactos, bobinas y bloques para el peldaño.',
        'Proyecto: programas, tareas, mapeo de E/S, comunicación y dispositivo de destino.',
        'Barra de estado: modo, sesión del runtime e intervalo de tarea.',
      ],
      provenance: 'Captura real, tomada del commit',
      statusLabel: 'Versión preliminar',
      status: 'La versión 2.0 es para evaluación. Ninguna placa se ha probado con hardware, y ZPLC no debe controlar maquinaria.',
      statusLink: 'Seguridad y limitaciones',
      statusTo: '/docs/safety-and-limitations',
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
  },
};

/** The content of one locale, with the data that both locales share. */
export function getLandingPageContent(locale) {
  const lang = locale in landingPageContent ? locale : 'en';
  const content = landingPageContent[lang];
  return {
    ...content,
    hero: { ...content.hero, callouts: content.hero.callouts.map((text, index) => ({ ...heroCallouts[index], text })) },
    languages: {
      ...content.languages,
      items: content.languages.items.map((item, index) => ({
        ...item,
        id: languageIds[index],
        shot: `editors/${languageIds[index]}-${lang}.png`,
        to: `/docs/reference/language-${languageIds[index]}`,
      })),
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
