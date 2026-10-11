// The port interface of the runtime and the port conformance suite, generated from the headers and the manifest (IO-013).
//
//   bun tools/docs/generate_port_interface.ts           write docs/docs/runtime/port-interface.md and the Spanish twin
//   bun tools/docs/generate_port_interface.ts --check   exit 1 when a page is stale, or a function has no group
//
// The sources are the two headers a port is written against, and tools/ci/port-conformance.json:
//
//   firmware/lib/zplc_core/include/zplc_hal.h          the functions of the HAL: clock, I/O table, storage, locks, services
//   firmware/lib/zplc_core/include/zplc_sched_core.h   zplc_sched_port_t: what an adapter hands the scheduler core
//   tools/ci/port-conformance.json                     the checks that run on each port, per category
//
// A function that the HAL header declares and that no group below claims fails the generator, so that the page cannot
// miss a function of the interface, and tools/ci/port-conformance.test.ts holds the manifest to the names of the tree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage, ROOT } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_port_interface.ts';
const HAL_HEADER = 'firmware/lib/zplc_core/include/zplc_hal.h';
const SCHED_HEADER = 'firmware/lib/zplc_core/include/zplc_sched_core.h';
const MANIFEST = 'tools/ci/port-conformance.json';

const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** The first sentence of a doc comment, on one line. */
function brief(comment: string): string {
  const lines = comment
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trim());
  const tagged = lines.findIndex((line) => line.startsWith('@brief'));
  const start = tagged >= 0 ? tagged : lines.findIndex((line) => line !== '');
  const out: string[] = [];
  for (const [index, line] of lines.slice(Math.max(start, 0)).entries()) {
    const content = (index === 0 ? line.replace(/^@brief\s*/, '') : line).trim();
    if (content === '' || content.startsWith('@') || content.startsWith('-')) break;
    out.push(content);
  }
  const sentence = out.join(' ');
  const end = sentence.search(/[.!?](\s|$)/);
  return (end >= 0 ? sentence.slice(0, end + 1) : sentence).trim();
}

export interface Declaration { name: string; brief: string }

/** The functions of the HAL header, in declaration order, each with the first sentence of its comment. */
export function halFunctions(header: string): Declaration[] {
  const found: Declaration[] = [];
  const pattern = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/)\s*[^;{}/]*?\b(zplc_(?:hal|io)_[a-z0-9_]+)\s*\([^;{}]*\)\s*;/g;
  for (const match of header.matchAll(pattern)) {
    if (!found.some((entry) => entry.name === match[2])) found.push({ name: match[2]!, brief: brief(match[1]!) });
  }
  return found;
}

/**
 * The callbacks of zplc_sched_port_t, in order, each with the first sentence of its comment. A callback that has no
 * comment of its own is the other half of the one before it (`enter` and `leave`, `lock_image` and `unlock_image`).
 */
export function schedulerPort(header: string): Declaration[] {
  const start = header.indexOf('typedef struct zplc_sched_port {');
  const end = header.indexOf('} zplc_sched_port_t;');
  if (start < 0 || end < start) throw new Error('zplc_sched_port_t is not in the scheduler core header');
  const body = header.slice(start, end);
  const found: Declaration[] = [];
  let from = 0;
  for (const member of body.matchAll(/\(\*(\w+)\)\s*\(/g)) {
    const between = body.slice(from, member.index);
    const comments = [...between.matchAll(/\/\*\*(?:(?!\*\/)[\s\S])*\*\//g)];
    const own = comments.at(-1);
    const previous = found.at(-1);
    found.push({
      name: member[1]!,
      brief: own ? brief(own[0]) : previous ? `The other half of \`${previous.name}\`.` : '',
    });
    from = (member.index ?? 0) + member[0].length;
  }
  return found;
}

interface Group { id: string; title: L10n; what: L10n; owns: (name: string) => boolean }

const GROUPS: Group[] = [
  {
    id: 'clock',
    title: { en: 'Clock', es: 'Reloj' },
    what: { en: 'The millisecond clock and the blocking sleep. The scheduler core also asks the adapter for a microsecond clock, `now_us`.', es: 'El reloj de milisegundos y la espera bloqueante. El núcleo del planificador además pide al adaptador un reloj de microsegundos, `now_us`.' },
    owns: (name) => name === 'zplc_hal_tick' || name === 'zplc_hal_sleep',
  },
  {
    id: 'io',
    title: { en: 'I/O table', es: 'Tabla de E/S' },
    what: { en: 'The channels of the board and the physical pins behind them. The core addresses a logical channel; the table says which pin it is and where it sits in the process image.', es: 'Los canales de la placa y los pines físicos que hay detrás. El núcleo direcciona un canal lógico; la tabla dice qué pin es y dónde está en la imagen de proceso.' },
    owns: (name) => /^zplc_io_/.test(name) || /^zplc_hal_(gpio|adc|dac)_/.test(name),
  },
  {
    id: 'storage',
    title: { en: 'Non-volatile storage', es: 'Almacenamiento no volátil' },
    what: { en: 'Keyed blobs that survive a power cycle: the stored program, the retentive memory, the configuration and the credentials.', es: 'Bloques con clave que sobreviven a un ciclo de energía: el programa guardado, la memoria retentiva, la configuración y las credenciales.' },
    owns: (name) => /^zplc_hal_persist_/.test(name),
  },
  {
    id: 'locks',
    title: { en: 'Locks', es: 'Cerrojos' },
    what: { en: 'Mutual exclusion between the scan and the threads around it. A lock that cannot be taken is a fault, not a retry.', es: 'Exclusión mutua entre el scan y los hilos que lo rodean. Un cerrojo que no se puede tomar es un fallo, no un reintento.' },
    owns: (name) => /^zplc_hal_mutex_/.test(name),
  },
  {
    id: 'services',
    title: { en: 'Log and life cycle', es: 'Registro y ciclo de vida' },
    what: { en: 'One log sink, and the calls that bring the port up before the runtime can enter RUN and take it down.', es: 'Un destino de registro, y las llamadas que levantan el puerto antes de que el runtime pueda entrar en RUN y lo bajan.' },
    owns: (name) => name === 'zplc_hal_log' || name === 'zplc_hal_init' || name === 'zplc_hal_shutdown',
  },
  {
    id: 'network',
    title: { en: 'Network (optional)', es: 'Red (opcional)' },
    what: { en: 'Sockets and name resolution. The portable core does not call them: the applications that need a network bring their own transport (tools/ci/hal-contract.json keeps the ledger), so no conformance leg covers them.', es: 'Sockets y resolución de nombres. El núcleo portable no los llama: las aplicaciones que necesitan red traen su propio transporte (tools/ci/hal-contract.json lleva el registro), de modo que ninguna etapa de conformidad los cubre.' },
    owns: (name) => /^zplc_hal_(net|dns|socket)_/.test(name),
  },
];

const INTRO: L10n = {
  en: [
    'A port is a platform that hosts the portable core: the virtual machine, the loader, the scheduler core and the storage of the program. The core owns what a program means; a port owns the clock, the pins, the storage, the locks and the thread that calls the scheduler. A port is written against two headers and nothing else, and passes one conformance suite.',
    '',
    'Ports in the repository: the Zephyr firmware (`firmware/lib/zplc_core/src/hal/zephyr`), the POSIX host runtime that Studio simulates with (`.../posix`) and the WebAssembly runtime (`.../wasm`). Whether a second, non-Zephyr port ships in 2.0 is decision D-06 of the remediation spec; this page and the suite are what such a port is written against.',
  ].join('\n'),
  es: [
    'Un puerto es una plataforma que aloja el núcleo portable: la máquina virtual, el cargador, el núcleo del planificador y el almacenamiento del programa. El núcleo es dueño de lo que significa un programa; un puerto es dueño del reloj, los pines, el almacenamiento, los cerrojos y el hilo que llama al planificador. Un puerto se escribe contra dos encabezados y nada más, y pasa una suite de conformidad.',
    '',
    'Puertos del repositorio: el firmware de Zephyr (`firmware/lib/zplc_core/src/hal/zephyr`), el runtime POSIX del host con el que Studio simula (`.../posix`) y el runtime WebAssembly (`.../wasm`). Si un segundo puerto que no sea de Zephyr se entrega en 2.0 es la decisión D-06 de la especificación de remediación; esta página y la suite son contra lo que se escribe un puerto así.',
  ].join('\n'),
};

const HEADINGS = {
  hal: { en: 'The HAL', es: 'La HAL' } as L10n,
  sched: { en: 'The scheduler port', es: 'El puerto del planificador' } as L10n,
  suite: { en: 'The conformance suite', es: 'La suite de conformidad' } as L10n,
  findings: { en: 'What the suite shows about the ports today', es: 'Qué muestra la suite de los puertos hoy' } as L10n,
};

const HAL_TEXT: L10n = {
  en: `The functions of \`${HAL_HEADER}\`, by what they serve. A function that a board cannot perform returns \`ZPLC_HAL_NOT_IMPL\`, the defined "not supported" result; a port that leaves one out does not link, and \`tools/ci/check_hal_contract.py\` lists the functions that nothing calls.`,
  es: `Las funciones de \`${HAL_HEADER}\`, según lo que sirven. Una función que una placa no puede realizar devuelve \`ZPLC_HAL_NOT_IMPL\`, el resultado definido de «no soportado»; un puerto que omite una no enlaza, y \`tools/ci/check_hal_contract.py\` lista las funciones que nadie llama.`,
};

const SCHED_TEXT: L10n = {
  en: `What an adapter hands the scheduler core (\`zplc_sched_port_t\` of \`${SCHED_HEADER}\`). Every member but \`now_us\` is optional: an absent callback is a step the platform does not have. The core has no synchronization of its own; the adapter supplies the locks. The adapters that exist are the POSIX session of the host runtime, the Zephyr scheduler and the single-task configuration of the firmware.`,
  es: `Lo que un adaptador entrega al núcleo del planificador (\`zplc_sched_port_t\` de \`${SCHED_HEADER}\`). Todo miembro salvo \`now_us\` es opcional: un callback ausente es un paso que la plataforma no tiene. El núcleo no tiene sincronización propia; el adaptador aporta los cerrojos. Los adaptadores que existen son la sesión POSIX del runtime del host, el planificador de Zephyr y la configuración de una sola tarea del firmware.`,
};

const SUITE_TEXT: L10n = {
  en: `A port passes the suite when every category below passes on it. The checks are listed in \`${MANIFEST}\`, and a test holds each name to the tree. A leg that is open says why and who owns it; an open leg is not a pass.`,
  es: `Un puerto pasa la suite cuando pasa en él cada categoría de abajo. Las pruebas están listadas en \`${MANIFEST}\`, y un test mantiene cada nombre atado al árbol. Una etapa abierta dice por qué y quién es su responsable; una etapa abierta no es un pase.`,
};

const FINDINGS: L10n = {
  en: [
    'The timing self-test reports the smallest advance of the tick that a sleep of 1 ms makes. On the POSIX host it is 1 ms. On the Zephyr targets of the suite (`native_sim` and QEMU Cortex-M3) the kernel tick is 10 ms (100 ticks per second, the default of the kernel) and a sleep of 1 ms moves the tick by 20 ms, so neither the clock nor the kernel timers of these targets resolve an interval shorter than that. The figure belongs to the build configuration of the suite; it is not a measurement of a board (HIL-010 holds the bench).',
    '',
    'The WebAssembly runtime does not run the scheduler, timing and storage legs: it drives the virtual machine directly and does not apply the retain rules. Its legs close with the shared core (RT-008, RT-027).',
  ].join('\n'),
  es: [
    'La autoprueba de tiempos informa el menor avance del tick que produce una espera de 1 ms. En el host POSIX es de 1 ms. En los destinos Zephyr de la suite (`native_sim` y QEMU Cortex-M3) el tick del kernel es de 10 ms (100 ticks por segundo, el valor por defecto del kernel) y una espera de 1 ms mueve el tick 20 ms, de modo que ni el reloj ni los temporizadores del kernel de estos destinos resuelven un intervalo menor que ese. La cifra pertenece a la configuración de compilación de la suite; no es una medición de una placa (HIL-010 es el banco).',
    '',
    'El runtime WebAssembly no ejecuta las etapas de planificador, tiempos y almacenamiento: maneja la máquina virtual directamente y no aplica las reglas de retención. Sus etapas se cierran con el núcleo compartido (RT-008, RT-027).',
  ].join('\n'),
};

interface Manifest {
  ports: Array<{ id: string; name: L10n; how: L10n }>;
  categories: Array<{ id: string; title: L10n; what: L10n; legs: Record<string, { ctest?: string[]; twister?: string[]; bun?: Array<{ file: string; test: string }>; open?: L10n & { owner: string } }> }>;
}

const COLUMNS = {
  hal: { en: ['Function', 'What it does'], es: ['Función', 'Descripción fuente'] },
  sched: { en: ['Callback', 'What it does'], es: ['Callback', 'Descripción fuente'] },
  suite: { en: ['Port', 'Checks', 'How to run'], es: ['Puerto', 'Pruebas', 'Cómo ejecutarlas'] },
} as const;

/** The groups of the HAL page; throws for a declared function that no group owns. */
export function groupedFunctions(functions: Declaration[]): Array<{ group: Group; functions: Declaration[] }> {
  const orphans = functions.filter((entry) => !GROUPS.some((group) => group.owns(entry.name)));
  if (orphans.length > 0) throw new Error(`the port interface page has no group for ${orphans.map((entry) => entry.name).join(', ')}: add it to a group of ${GENERATOR}`);
  return GROUPS.map((group) => ({ group, functions: functions.filter((entry) => group.owns(entry.name)) })).filter((entry) => entry.functions.length > 0);
}

export function portInterfaceBody(lang: Lang): string {
  const functions = halFunctions(text(HAL_HEADER));
  const callbacks = schedulerPort(text(SCHED_HEADER));
  const manifest = JSON.parse(text(MANIFEST)) as Manifest;
  const sections: string[] = [INTRO[lang]];

  sections.push(`## ${HEADINGS.hal[lang]}`, HAL_TEXT[lang]);
  for (const { group, functions: own } of groupedFunctions(functions)) {
    sections.push(
      `### ${group.title[lang]}`,
      group.what[lang],
      table([...COLUMNS.hal[lang]], own.map((entry) => [code(`${entry.name}()`), prose(entry.brief)])),
    );
  }

  sections.push(
    `## ${HEADINGS.sched[lang]}`,
    SCHED_TEXT[lang],
    table([...COLUMNS.sched[lang]], callbacks.map((entry) => [code(entry.name), prose(entry.brief)])),
  );

  sections.push(`## ${HEADINGS.suite[lang]}`, SUITE_TEXT[lang]);
  for (const category of manifest.categories) {
    const rows = manifest.ports.map((port) => {
      const leg = category.legs[port.id]!;
      const open = leg.open;
      const checks = open
        ? `${lang === 'en' ? 'Open' : 'Abierta'}: ${prose(open[lang])} ${lang === 'en' ? 'Owner' : 'Responsable'}: ${prose(open.owner)}.`
        : [...(leg.ctest ?? []), ...(leg.twister ?? []), ...(leg.bun ?? []).map((entry) => entry.file)].map((name) => code(name)).join(', ');
      return [port.name[lang], checks, open ? '-' : port.how[lang]];
    });
    sections.push(`### ${category.title[lang]}`, prose(category.what[lang]), table([...COLUMNS.suite[lang]], rows));
  }

  sections.push(`## ${HEADINGS.findings[lang]}`, FINDINGS[lang]);
  return sections.join('\n\n');
}

export const PAGES: ReferencePage[] = [
  {
    path: 'runtime/port-interface.md',
    title: { en: 'Port interface and conformance suite', es: 'Interfaz de puerto y suite de conformidad' },
    label: { en: 'Port interface', es: 'Interfaz de puerto' },
    description: {
      en: 'What a port of the ZPLC runtime provides, and the conformance suite that every port passes, generated from the headers and the manifest of checks.',
      es: 'Qué provee un puerto del runtime ZPLC y la suite de conformidad que pasa cada puerto, generadas de los encabezados y del manifiesto de pruebas.',
    },
    body: portInterfaceBody,
  },
];

if (import.meta.main) {
  process.exit(runGenerator(GENERATOR, outputsOf(GENERATOR, PAGES), process.argv.slice(2)));
}
