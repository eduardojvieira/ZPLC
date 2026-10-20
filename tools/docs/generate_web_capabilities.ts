// The page "ZPLC in the browser" (REL-037, decision D-07), generated from the table the web build reads its notice from.
//
//   bun tools/docs/generate_web_capabilities.ts           write docs/docs/ide/browser.md and the Spanish twin
//   bun tools/docs/generate_web_capabilities.ts --check   exit 1 when a page is stale
//
// The list of what the web build lacks is packages/zplc-ide/src/platform/webCapabilities.ts with the texts of
// packages/zplc-ide/src/i18n/catalog/webBuild.ts: the in-app notice and this page cannot say different things.
import { WEB_MISSING_FEATURES } from '../../packages/zplc-ide/src/platform/webCapabilities.ts';
import { webBuildEn, webBuildEs } from '../../packages/zplc-ide/src/i18n/catalog/webBuild.ts';
import { bullets, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_web_capabilities.ts';
export const APP_URL = 'https://eduardojvieira.github.io/ZPLC/app/';

const CATALOG: Record<Lang, Record<string, string>> = { en: webBuildEn, es: webBuildEs };

const COLUMNS: Record<Lang, [string, string]> = { en: ['Feature', 'In the browser'], es: ['Función', 'En el navegador'] };

const INTRO: L10n = {
  en: [
    `ZPLC also runs in a browser at [${APP_URL}](${APP_URL}). It is the same application as the desktop app, built as a static site and deployed with this documentation. It needs no installation and no account, and it sends nothing anywhere: there is no server behind it.`,
    '',
    'It is made for trying ZPLC, for the examples and the Learn course, and for editing and simulating a small project on a computer where you cannot install anything. It is not the way to work on a real machine: for that, [install the desktop app](../getting-started/install.md).',
  ].join('\n'),
  es: [
    `ZPLC también funciona en un navegador, en [${APP_URL}](${APP_URL}). Es la misma aplicación que la de escritorio, compilada como un sitio estático y publicada junto con esta documentación. No necesita instalación ni cuenta, y no envía nada a ningún lado: no hay un servidor detrás.`,
    '',
    'Sirve para probar ZPLC, para los ejemplos y el curso de Learn, y para editar y simular un proyecto pequeño en un equipo donde no puede instalar nada. No es la forma de trabajar en una máquina real: para eso, [instale la aplicación de escritorio](../getting-started/install.md).',
  ].join('\n'),
};

const WORKS: L10n = {
  en: [
    '## What works',
    '',
    bullets([
      'Editing programs in ST, IL, LD, FBD and SFC, with the same compiler as the desktop app.',
      'Building a project and seeing its diagnostics.',
      'Simulating on the WASM runtime, with the values of variables on screen. The runtime is the core of the firmware compiled to WebAssembly, and it says what it cannot do in the same capability profile as the desktop app: see [the browser runtime](../runtime/browser-runtime.md).',
      'The examples and the Learn course, which open as editable copies.',
    ]),
  ].join('\n'),
  es: [
    '## Qué funciona',
    '',
    bullets([
      'Editar programas en ST, IL, LD, FBD y SFC, con el mismo compilador que la aplicación de escritorio.',
      'Compilar un proyecto y ver sus diagnósticos.',
      'Simular en el runtime WASM, con los valores de las variables en pantalla. El runtime es el núcleo del firmware compilado a WebAssembly, e informa lo que no puede hacer en el mismo perfil de capacidades que la aplicación de escritorio: vea [el runtime del navegador](../runtime/browser-runtime.md).',
      'Los ejemplos y el curso de Learn, que se abren como copias editables.',
    ]),
  ].join('\n'),
};

const PROJECTS: L10n = {
  en: [
    '## Where your projects live',
    '',
    'In Chrome and Edge, **Open project** opens a folder on your computer through the File System Access API, and saving writes to that folder. You choose the folder and the browser asks for permission.',
    '',
    'In any current browser, an example, a lesson or a new project can be kept **in this browser**. The browser stores it in a folder you cannot see, and clearing the site data removes it. Download or copy anything you want to keep. Firefox and Safari have no folder access, so only the browser storage is available there.',
  ].join('\n'),
  es: [
    '## Dónde viven sus proyectos',
    '',
    'En Chrome y Edge, **Abrir proyecto** abre una carpeta de su equipo mediante la API File System Access, y al guardar se escribe en esa carpeta. Usted elige la carpeta y el navegador le pide permiso.',
    '',
    'En cualquier navegador actual, un ejemplo, una lección o un proyecto nuevo se puede conservar **en este navegador**. El navegador lo guarda en una carpeta que usted no ve, y borrar los datos del sitio lo elimina. Descargue o copie lo que quiera conservar. Firefox y Safari no tienen acceso a carpetas, así que allí solo está el almacenamiento del navegador.',
  ].join('\n'),
};

const LACKS: L10n = {
  en: '## What is not available',
  es: '## Qué no está disponible',
};

const LACKS_INTRO: L10n = {
  en: 'These features need the desktop app. In the browser they are absent or disabled, and the page says why; none of them is left half working. The same list is shown inside the application.',
  es: 'Estas funciones necesitan la aplicación de escritorio. En el navegador están ausentes o desactivadas, y la página dice por qué; ninguna queda a medias. La misma lista se muestra dentro de la aplicación.',
};

const SAFETY: L10n = {
  en: [
    '## Safety and privacy',
    '',
    bullets([
      'The browser build never connects to, flashes, deploys to, forces, or runs or stops a device. Device connection is off, not hidden behind a setting. For hardware, use the desktop app and its human-confirmed flows.',
      'There is no AI assistant, because its key and its requests belong to the desktop app and no server stands behind this page.',
      'The page is served with a content security policy that allows only its own scripts, styles and workers, WebAssembly compiled from its own bundle, and no network request to another origin.',
      'A simulation in a browser is not a controller. Its timing is the browser clock, which a background tab throttles. Do not use it to decide anything about a real machine: [Safety and limitations](../safety-and-limitations.md).',
    ]),
  ].join('\n'),
  es: [
    '## Seguridad y privacidad',
    '',
    bullets([
      'La versión para navegador nunca se conecta a un dispositivo, ni lo programa, ni despliega en él, ni lo fuerza, ni lo pone en marcha o lo detiene. La conexión con dispositivos está desactivada, no escondida tras un ajuste. Para el hardware, use la aplicación de escritorio y sus flujos con confirmación humana.',
      'No hay asistente de IA, porque su clave y sus solicitudes pertenecen a la aplicación de escritorio y no hay un servidor detrás de esta página.',
      'La página se sirve con una política de seguridad de contenido que solo permite sus propios scripts, estilos y workers, WebAssembly compilado desde su propio paquete, y ninguna solicitud de red a otro origen.',
      'Una simulación en un navegador no es un controlador. Sus tiempos son los del reloj del navegador, que una pestaña en segundo plano ralentiza. No la use para decidir nada sobre una máquina real: [Seguridad y límites](../safety-and-limitations.md).',
    ]),
  ].join('\n'),
};

const STATUS: L10n = {
  en: [
    '## What has been tried',
    '',
    'The web build and its browser smoke test (load, an example, an edit, a save, a build, a simulation with a value that changes, and the refused device actions) have been run on Linux with Chromium. The workflow that publishes the build with this documentation is written, and has not run on GitHub yet. The build has not been tried on Windows or macOS, or in Firefox or Safari.',
  ].join('\n'),
  es: [
    '## Qué se ha probado',
    '',
    'La versión web y su prueba de humo en el navegador (cargar, un ejemplo, una edición, guardar, compilar, una simulación con un valor que cambia y las acciones de dispositivo rechazadas) se ejecutaron en Linux con Chromium. El flujo de trabajo que publica la versión junto con esta documentación está escrito y todavía no se ejecutó en GitHub. La versión no se probó en Windows ni en macOS, ni en Firefox ni en Safari.',
  ].join('\n'),
};

export function featureRows(lang: Lang): string[][] {
  return WEB_MISSING_FEATURES.map((id) => [`**${prose(CATALOG[lang][`web.feature.${id}.title`]!)}**`, prose(CATALOG[lang][`web.feature.${id}.reason`]!)]);
}

export function browserBody(lang: Lang): string {
  return [INTRO[lang], WORKS[lang], PROJECTS[lang], [LACKS[lang], '', LACKS_INTRO[lang], '', table([...COLUMNS[lang]], featureRows(lang))].join('\n'), SAFETY[lang], STATUS[lang]].join('\n\n');
}

export const PAGES: ReferencePage[] = [
  {
    path: 'ide/browser.md',
    title: { en: 'ZPLC in the browser', es: 'ZPLC en el navegador' },
    label: { en: 'In the browser', es: 'En el navegador' },
    description: {
      en: 'The hosted web build of ZPLC for Chrome and Edge: what works, where projects live, and the features that need the desktop app.',
      es: 'La versión web de ZPLC para Chrome y Edge: qué funciona, dónde viven los proyectos y las funciones que necesitan la aplicación de escritorio.',
    },
    body: browserBody,
  },
];

if (import.meta.main) {
  process.exit(runGenerator(GENERATOR, outputsOf(GENERATOR, PAGES), process.argv.slice(2)));
}
