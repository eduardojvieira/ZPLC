// The references that are read off a source file (DOC-008): Kconfig options, shell commands, the zplc.json schema, the
// scenario file format, the command line, the MCP server and the runtime session protocol. (The runtime C API and the
// boards have their own generators, tools/docs/generate_runtime_reference.py and generate_board_reference.py.)
//
//   bun tools/docs/generate_source_references.ts           write the seven pages and their Spanish twins
//   bun tools/docs/generate_source_references.ts --check   exit 1 when a page is stale, or when a source holds something
//                                                          that the page cannot say (a command without a description)
//
// The tables are read off the sources by tools/docs/source-parsers.ts, so a table is identical in English and in Spanish:
// the text that a source holds is the source's own. The headings and the sentences around the tables are localised.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { code, fence, outputsOf, prose, ROOT, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';
import { parseCli, parseKconfig, parseMcp, parseProtocol, parseScenarioFormat, parseShellCommands } from './source-parsers';

export const GENERATOR = 'tools/docs/generate_source_references.ts';

export const SOURCES = {
  kconfig: 'firmware/zephyr/Kconfig',
  shell: 'firmware/app/src/shell_cmds.c',
  schema: 'packages/zplc-ide/zplc.schema.json',
  cli: 'packages/zplc-ide/src/cli/index.ts',
  mcp: 'packages/zplc-ide/src/mcp/server.ts',
  mcpEntry: 'packages/zplc-ide/src/mcp/index.ts',
  engine: 'packages/zplc-ide/src/test-engine/index.ts',
  workspace: 'packages/zplc-ide/src/cli/workspace.ts',
  protocol: 'firmware/apps/posix_host/src/native_runtime_session.c',
  scenarioExample: 'packages/zplc-ide/projects/blinky_st/tests/blinky-st.scenario.json',
} as const;

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const loc = (text: L10n, lang: Lang) => text[lang];
const cell = (text: string) => prose(text).replace(/\s+/g, ' ');

const FROM_SOURCE: L10n = {
  en: 'This table is read off the source file {file}; its text is the source\'s own, so it is the same in English and in Spanish.',
  es: 'Esta tabla se lee del archivo fuente {file}; su texto es el de la propia fuente, por eso es igual en inglés y en español.',
};
const fromSource = (file: string, lang: Lang) => FROM_SOURCE[lang].replace('{file}', code(file));

// ---------------------------------------------------------------------------
// Kconfig
// ---------------------------------------------------------------------------

const KCONFIG_HEAD: Record<Lang, string[]> = {
  en: ['Symbol', 'Type', 'Default', 'Range', 'Depends on', 'Description'],
  es: ['Símbolo', 'Tipo', 'Predeterminado', 'Rango', 'Depende de', 'Descripción'],
};

export function kconfigBody(lang: Lang): string {
  const symbols = parseKconfig(read(SOURCES.kconfig));
  const intro: L10n = {
    en: `The ZPLC runtime module defines ${symbols.length} Kconfig symbols. Set one in the \`prj.conf\` of an application or in a board overlay as \`CONFIG_<SYMBOL>=value\`; a symbol that depends on another is available only while that one is enabled.`,
    es: `El módulo del runtime ZPLC define ${symbols.length} símbolos de Kconfig. Se fija uno en el \`prj.conf\` de una aplicación o en un overlay de placa como \`CONFIG_<SÍMBOLO>=valor\`; un símbolo que depende de otro solo está disponible mientras ese otro esté habilitado.`,
  };
  return [
    intro[lang],
    fromSource(SOURCES.kconfig, lang),
    table(KCONFIG_HEAD[lang], symbols.map((symbol) => [
      code(`CONFIG_${symbol.name}`),
      code(symbol.type),
      symbol.defaults.length > 0 ? symbol.defaults.map((value) => code(value)).join(', ') : '',
      symbol.range ? `${code(symbol.range[0])} to ${code(symbol.range[1])}` : '',
      symbol.depends.map((name) => code(`CONFIG_${name}`)).join(', '),
      cell((symbol.help || symbol.prompt).replace(/\s+/g, ' ').trim()),
    ])),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Shell commands
// ---------------------------------------------------------------------------

const SHELL_HEAD: Record<Lang, string[]> = {
  en: ['Command', 'Kind', 'Arguments', 'Description', 'Available when'],
  es: ['Comando', 'Clase', 'Argumentos', 'Descripción', 'Disponible cuando'],
};

export function shellBody(lang: Lang): string {
  const commands = parseShellCommands(read(SOURCES.shell));
  const kind: Record<Lang, { group: string; command: string }> = { en: { group: 'group', command: 'command' }, es: { group: 'grupo', command: 'comando' } };
  const intro: L10n = {
    en: `The device shell has one root command, ${code('zplc')}, with ${commands.length - 1} subcommands. A group only holds subcommands. The arguments are the words after the command name; a command is present only when the Kconfig symbol of the last column is enabled. The runtime of a desktop simulation has no shell: it speaks the [session protocol](./runtime-protocol.md).`,
    es: `La consola del dispositivo tiene un comando raíz, ${code('zplc')}, con ${commands.length - 1} subcomandos. Un grupo solo contiene subcomandos. Los argumentos son las palabras que siguen al nombre del comando; un comando solo está presente cuando el símbolo de Kconfig de la última columna está habilitado. El runtime de una simulación de escritorio no tiene consola: habla el [protocolo de sesión](./runtime-protocol.md).`,
  };
  const args = (command: (typeof commands)[number]): string => {
    if (command.group) return '';
    const required = command.required ?? 0;
    const optional = command.optional ?? 0;
    const words = lang === 'en' ? { required: 'required', optional: 'optional', none: 'none' } : { required: 'obligatorio', optional: 'opcional', none: 'ninguno' };
    return [required > 0 ? `${required} ${words.required}` : '', optional > 0 ? `${optional} ${words.optional}` : ''].filter(Boolean).join(', ') || words.none;
  };
  return [
    intro[lang],
    fromSource(SOURCES.shell, lang),
    table(SHELL_HEAD[lang], commands.map((command) => [
      code(command.path.join(' ')),
      command.group ? kind[lang].group : kind[lang].command,
      args(command),
      cell(command.help),
      command.when.map((name) => code(`CONFIG_${name}`)).join(', '),
    ])),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// zplc.json
// ---------------------------------------------------------------------------

interface Schema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  $ref?: string;
  definitions?: Record<string, Schema>;
  anyOf?: Schema[];
}

export interface SchemaRow { path: string; type: string; required: boolean; default: string; description: string }

export function schemaRows(root: Schema): SchemaRow[] {
  const rows: SchemaRow[] = [];
  const resolve = (node: Schema): Schema => {
    if (!node.$ref) return node;
    const name = node.$ref.replace('#/definitions/', '');
    const target = root.definitions?.[name];
    if (!target) throw new Error(`zplc.schema.json: ${node.$ref} is not defined`);
    return { ...target, ...(node.description ? { description: node.description } : {}) };
  };
  const describe = (node: Schema): string => {
    const base = Array.isArray(node.type) ? node.type.join(' | ') : node.type ?? 'object';
    if (node.enum) return `${base}: ${node.enum.map((value) => JSON.stringify(value)).join(' | ')}`;
    const between = (low: number | undefined, high: number | undefined, unit: string): string => {
      if (low === undefined && high === undefined) return '';
      if (high === undefined) return ` (${unit}>= ${low})`;
      if (low === undefined) return ` (${unit}<= ${high})`;
      return ` (${unit}${low} to ${high})`;
    };
    if (base === 'array') {
      const item = node.items ? describe(resolve(node.items)) : 'any';
      return `array of ${item}${between(node.minItems, node.maxItems, 'items ')}`;
    }
    return `${base}${between(node.minimum, node.maximum, '')}${between(node.minLength, node.maxLength, 'length ')}`;
  };
  const walk = (node: Schema, path: string, requiredHere: boolean) => {
    const resolved = resolve(node);
    if (path !== '') {
      rows.push({
        path,
        type: describe(resolved),
        required: requiredHere,
        default: resolved.default === undefined ? '' : JSON.stringify(resolved.default),
        description: resolved.description ?? '',
      });
    }
    const members = resolved.type === 'array' && resolved.items ? resolve(resolved.items) : resolved;
    const base = resolved.type === 'array' ? `${path}[]` : path;
    for (const [name, child] of Object.entries(members.properties ?? {})) {
      walk(child, base === '' ? name : `${base}.${name}`, (members.required ?? []).includes(name));
    }
  };
  walk(root, '', true);
  return rows;
}

const SCHEMA_HEAD: Record<Lang, string[]> = {
  en: ['Field', 'Type', 'Required', 'Default', 'Description'],
  es: ['Campo', 'Tipo', 'Obligatorio', 'Predeterminado', 'Descripción'],
};

export function schemaBody(lang: Lang): string {
  const schema = JSON.parse(read(SOURCES.schema)) as Schema;
  const rows = schemaRows(schema);
  const yes: L10n = { en: 'yes', es: 'sí' };
  const intro: L10n = {
    en: `Every field of the project file ${code('zplc.json')} that the schema ${code(SOURCES.schema)} defines, ${rows.length} in all. A field of an array is written with ${code('[]')}: ${code('tasks[].name')} is the ${code('name')} of each task. A field is required only inside an object that is present.`,
    es: `Todos los campos del archivo de proyecto ${code('zplc.json')} que define el esquema ${code(SOURCES.schema)}, ${rows.length} en total. Un campo de una lista se escribe con ${code('[]')}: ${code('tasks[].name')} es el ${code('name')} de cada tarea. Un campo es obligatorio solo dentro de un objeto que está presente.`,
  };
  const top = (schema.required ?? []).map((name) => code(name)).join(', ');
  const required: L10n = {
    en: `A project file must have ${top}. The editor and the tools validate a file against this schema before they use it.`,
    es: `Un archivo de proyecto debe tener ${top}. El editor y las herramientas validan un archivo contra este esquema antes de usarlo.`,
  };
  return [
    intro[lang],
    required[lang],
    fromSource(SOURCES.schema, lang),
    table(SCHEMA_HEAD[lang], rows.map((row) => [
      code(row.path), code(row.type), row.required ? yes[lang] : '', row.default === '' ? '' : code(row.default), cell(row.description),
    ])),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Scenario files
// ---------------------------------------------------------------------------

const SCENARIO_FIELDS: Record<string, string> = {
  schemaVersion: 'Always 1.',
  id: 'Name of the scenario; `scenario-run` and the MCP tool `scenario_run` select it by this name.',
  tickMs: 'Milliseconds of simulated time per scan, a positive integer.',
  durationMs: 'Length of the scenario in milliseconds, a multiple of `tickMs`.',
  events: 'Inputs to write, in time order; may be empty.',
  expectations: 'What the outputs must do; at least one.',
  plant: 'Optional: one of the plant models below, which drives its own inputs from the outputs of the program.',
  atMs: 'Time of the event, a multiple of `tickMs`.',
  set: 'BOOL input signals to write, `{"Program.variable": true}`.',
};

const SCENARIO_KINDS: Record<string, string> = {
  AT: 'The condition holds at the sample of `atMs`.',
  WITHIN: 'The condition holds at some sample from `fromMs` to `fromMs + withinMs`.',
  FOR: 'The condition holds at every sample from `fromMs` to `fromMs + forMs`.',
  EVENTUALLY: 'The condition holds at some sample from `fromMs` to `fromMs + withinMs`.',
  ALWAYS: 'The condition holds at every sample of the scenario.',
  NEVER: 'The condition holds at no sample of the scenario.',
  UNTIL: 'From `fromMs` the condition holds at every sample until the first sample at which the inputs of `until` match.',
  RISING: 'The one output of the condition goes TRUE between two consecutive samples, from `fromMs` to `fromMs + withinMs`.',
  FALLING: 'The one output of the condition goes FALSE between two consecutive samples, from `fromMs` to `fromMs + withinMs`.',
};

const SCENARIO_FIELD_NOTES: Record<string, string> = {
  kind: 'The kind of expectation, from the table above.',
  atMs: 'Time of the sample, a multiple of `tickMs`.',
  fromMs: 'Start of the window, a multiple of `tickMs`.',
  withinMs: 'Length of the window, a multiple of `tickMs`.',
  forMs: 'Length of the window, a multiple of `tickMs`.',
  condition: 'BOOL output signals and the value each must hold, `{"Program.variable": false}`.',
  until: 'BOOL input signals and the value each must hold to end the window.',
};

const SCENARIO_LIMITS: Record<string, string> = {
  MAX_EVENTS: 'Events in one scenario',
  MAX_EXPECTATIONS: 'Expectations in one scenario',
  MAX_SIGNALS: 'Distinct signals in one scenario',
  MAX_SAMPLES: 'Samples of one scenario (`durationMs / tickMs + 1`)',
  MAX_TRACE_VALUES: 'Values of one trace (samples times signals)',
  tickMs: 'Largest `tickMs`, in milliseconds',
  durationMs: 'Largest `durationMs`, in milliseconds',
  'id length': 'Longest `id`, in characters',
  SCENARIO_MAX_BYTES: 'Bytes of one scenario file',
  SCENARIOS_MAX_COUNT: 'Scenario files in one project',
  SCENARIOS_MAX_BYTES: 'Bytes of all the scenario files of one project',
};

export function scenarioErrors(): string[] {
  const format = parseScenarioFormat(read(SOURCES.engine), read(SOURCES.workspace));
  const errors: string[] = [];
  for (const field of [...format.fields, ...format.optionalFields, ...format.eventFields]) {
    if (!(field in SCENARIO_FIELDS)) errors.push(`${SOURCES.engine}: the scenario field ${field} has no description in ${GENERATOR}`);
  }
  for (const { name } of format.limits) if (!(name in SCENARIO_LIMITS)) errors.push(`${SOURCES.engine}: the limit ${name} has no description in ${GENERATOR}`);
  for (const { kind, fields } of format.kinds) {
    if (!(kind in SCENARIO_KINDS)) errors.push(`${SOURCES.engine}: the expectation kind ${kind} has no description in ${GENERATOR}`);
    for (const field of fields) if (!(field in SCENARIO_FIELD_NOTES)) errors.push(`${SOURCES.engine}: the expectation field ${field} has no description in ${GENERATOR}`);
  }
  return errors;
}

export function scenarioBody(lang: Lang): string {
  const format = parseScenarioFormat(read(SOURCES.engine), read(SOURCES.workspace));
  const head = lang === 'en' ? ['Field', 'Description'] : ['Campo', 'Descripción'];
  const kinds = lang === 'en' ? ['Kind', 'Fields', 'Meaning'] : ['Clase', 'Campos', 'Significado'];
  const limits = lang === 'en' ? ['Limit', 'Value'] : ['Límite', 'Valor'];
  const intro: L10n = {
    en: `A scenario is a JSON file in the ${code('tests/')} folder of a project, named ${code('*.scenario.json')}. It writes BOOL inputs at chosen times, runs the program on the native runtime on a virtual clock, and checks BOOL outputs. A signal is written ${code('Program.variable')}, or the name of a ${code('VAR_GLOBAL')} alone. ${code('zplc-cli test')} runs every scenario of a project; ${code('zplc-cli scenario-run')} runs one.`,
    es: `Un escenario es un archivo JSON en la carpeta ${code('tests/')} de un proyecto, llamado ${code('*.scenario.json')}. Escribe entradas BOOL en instantes elegidos, ejecuta el programa en el runtime nativo con un reloj virtual y comprueba salidas BOOL. Una señal se escribe ${code('Programa.variable')}, o solo el nombre de una ${code('VAR_GLOBAL')}. ${code('zplc-cli test')} ejecuta todos los escenarios de un proyecto; ${code('zplc-cli scenario-run')} ejecuta uno.`,
  };
  const heading: Record<string, L10n> = {
    fields: { en: 'Fields of a scenario', es: 'Campos de un escenario' },
    events: { en: 'Events', es: 'Eventos' },
    expectations: { en: 'Expectations', es: 'Expectativas' },
    fieldsOfExpectation: { en: 'Fields of an expectation', es: 'Campos de una expectativa' },
    plants: { en: 'Plant models', es: 'Modelos de planta' },
    limits: { en: 'Limits', es: 'Límites' },
    example: { en: 'Example', es: 'Ejemplo' },
  };
  const eventSentence: L10n = {
    en: `An event has ${format.eventFields.map((field) => code(field)).join(' and ')}.`,
    es: `Un evento tiene ${format.eventFields.map((field) => code(field)).join(' y ')}.`,
  };
  const plants: L10n = {
    en: `${format.plants.map((plant) => code(plant)).join(', ')}. A plant model requires ${code('tickMs')} 10 and the variables of its own program.`,
    es: `${format.plants.map((plant) => code(plant)).join(', ')}. Un modelo de planta exige ${code('tickMs')} 10 y las variables de su propio programa.`,
  };
  const expectationFields = [...new Set(format.kinds.flatMap((entry) => entry.fields))];
  return [
    intro[lang],
    fromSource(SOURCES.engine, lang),
    `## ${heading.fields![lang]}`,
    table(head, [...format.fields, ...format.optionalFields].map((field) => [code(field), prose(SCENARIO_FIELDS[field]!)])),
    `## ${heading.events![lang]}`,
    eventSentence[lang],
    table(head, format.eventFields.map((field) => [code(field), prose(SCENARIO_FIELDS[field]!)])),
    `## ${heading.expectations![lang]}`,
    table(kinds, format.kinds.map((entry) => [code(entry.kind), entry.fields.filter((field) => field !== 'kind').map((field) => code(field)).join(', '), prose(SCENARIO_KINDS[entry.kind]!)])),
    `### ${heading.fieldsOfExpectation![lang]}`,
    table(head, expectationFields.map((field) => [code(field), prose(SCENARIO_FIELD_NOTES[field]!)])),
    `## ${heading.plants![lang]}`,
    plants[lang],
    `## ${heading.limits![lang]}`,
    table(limits, format.limits.map((limit) => [prose(SCENARIO_LIMITS[limit.name]!), code(limit.value)])),
    `## ${heading.example![lang]}`,
    fence('json', read(SOURCES.scenarioExample)),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const CLI_COMMANDS: Record<string, string> = {
  inspect: 'Read the project file and list its tasks and sources.',
  validate: 'Validate the project file and its sources without compiling.',
  check: 'Compile the project and discard the program: the build diagnostics only.',
  'safety-check': 'Check that every pair of incompatible outputs declared in `zplc.json` is covered by the programs.',
  symbols: 'List the public symbols of the project.',
  'migrate-preview': 'Show what migrating a version 1 project file to version 2 would change.',
  migrate: 'Write the version 2 project file that the migration produces.',
  test: 'Run every scenario of the project on the native runtime and report each expectation.',
  'scenario-run': 'Run one scenario by its identifier.',
  'toolchain-inspect': 'Report which firmware build prerequisites are present in a repository checkout.',
  'firmware-build': 'Run a local, ephemeral cross-build of the firmware of one board; it never flashes or deploys.',
  compile: 'Compile a project or one source file to a program, or to its assembly listing with `--emit asm`.',
};

export function cliErrors(): string[] {
  const cli = parseCli(read(SOURCES.cli));
  const errors: string[] = [];
  for (const { name } of cli.commands) if (!(name in CLI_COMMANDS)) errors.push(`${SOURCES.cli}: the command ${name} has no description in ${GENERATOR}`);
  return errors;
}

export function cliBody(lang: Lang): string {
  const cli = parseCli(read(SOURCES.cli));
  const names = [...new Set(cli.commands.map((command) => command.name))];
  const intro: L10n = {
    en: `${code('zplc-cli')} is the command line of the ZPLC tool API, the same operations that Studio and the [MCP server](./mcp.md) use: ${names.length} commands. It never flashes, deploys, forces or runs a device. Every command takes a workspace folder (or, for a build, a repository root); ${code('--json')} prints one line of JSON, with the evidence of the operation, instead of text. Each diagnostic of a failed build has a ${code('code')} (the list is the [diagnostic codes](./diagnostic-codes.md)), its message, where it starts (${code('line')}, ${code('column')}), where it ends (${code('endLine')}, ${code('endColumn')}) and its file (${code('path')}); the text output ends the line with the code in brackets.`,
    es: `${code('zplc-cli')} es la línea de comandos de la API de herramientas de ZPLC, las mismas operaciones que usan Studio y el [servidor MCP](./mcp.md): ${names.length} comandos. Nunca graba, despliega, fuerza ni pone en marcha un dispositivo. Cada comando recibe una carpeta de espacio de trabajo (o, para una compilación, la raíz del repositorio); ${code('--json')} imprime una línea de JSON, con la evidencia de la operación, en lugar de texto. Cada diagnóstico de una compilación fallida tiene un ${code('code')} (la lista son los [códigos de diagnóstico](./diagnostic-codes.md)), su mensaje, dónde empieza (${code('line')}, ${code('column')}), dónde termina (${code('endLine')}, ${code('endColumn')}) y su archivo (${code('path')}); la salida de texto termina la línea con el código entre corchetes.`,
  };
  const headings: Record<string, L10n> = {
    commands: { en: 'Commands', es: 'Comandos' },
    options: { en: 'Options', es: 'Opciones' },
    exit: { en: 'Exit codes', es: 'Códigos de salida' },
  };
  const commandHead = lang === 'en' ? ['Command', 'Usage', 'Description'] : ['Comando', 'Uso', 'Descripción'];
  const optionHead = lang === 'en' ? ['Option', 'Description'] : ['Opción', 'Descripción'];
  const exitHead = lang === 'en' ? ['Code', 'Meaning'] : ['Código', 'Significado'];
  return [
    intro[lang],
    fromSource(SOURCES.cli, lang),
    `## ${headings.commands![lang]}`,
    table(commandHead, cli.commands.map((command) => [code(command.name), code(command.usage), prose(CLI_COMMANDS[command.name] ?? '')])),
    `## ${headings.options![lang]}`,
    table(optionHead, cli.options.map((option) => [code(option.flags), cell(option.description)])),
    `## ${headings.exit![lang]}`,
    table(exitHead, cli.exitCodes.map((entry) => [code(String(entry.code)), cell(entry.meaning)])),
    ...(cli.footnote ? [cell(cli.footnote)] : []),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

/** The protocol revision of the MCP SDK that the server is built on; the release smoke test asks for tools with it. */
const MCP_REVISION = '2026-07-28';

export function mcpBody(lang: Lang): string {
  const mcp = parseMcp(read(SOURCES.mcp));
  const usage = /Usage: (zplc-mcp [^\\']+?)\\n/.exec(read(SOURCES.mcpEntry))?.[1];
  if (!usage) throw new Error(`${SOURCES.mcpEntry}: the usage line of zplc-mcp was not found`);
  const writers = mcp.tools.filter((tool) => !tool.readOnly).map((tool) => code(tool.name)).join(', ');
  const intro: L10n = {
    en: `${code('zplc-mcp')} is a local server of the Model Context Protocol over standard input and output. It exposes ${mcp.tools.length} tools and ${mcp.resources.length} resources for one workspace. Every tool is read-only except ${writers}, which runs a local ephemeral cross-build: no tool flashes, deploys, forces, starts, stops or opens a serial port or a shell. The results are evidence of a recorded host run, not of hardware.`,
    es: `${code('zplc-mcp')} es un servidor local del Model Context Protocol sobre entrada y salida estándar. Expone ${mcp.tools.length} herramientas y ${mcp.resources.length} recursos para un espacio de trabajo. Todas las herramientas son de solo lectura salvo ${writers}, que ejecuta una compilación cruzada local y efímera: ninguna herramienta graba, despliega, fuerza, arranca, detiene ni abre un puerto serie o una consola. Los resultados son evidencia de una ejecución registrada en el host, no del hardware.`,
  };
  // The entry point asks the SDK to answer a 2025-era opening with an error (`legacy: 'reject'`) or to serve it; the page says which.
  const legacy = /legacy:\s*'(reject|serve)'/.exec(read(SOURCES.mcpEntry))?.[1];
  if (!legacy) throw new Error(`${SOURCES.mcpEntry}: the legacy option of the stdio transport was not found`);
  const revision: Record<'reject' | 'serve', L10n> = {
    reject: {
      en: `The server speaks protocol revision ${MCP_REVISION} and no older one: its entry point starts the transport with ${code("legacy: 'reject'")}. A client names the revision and its capabilities in the ${code('_meta')} of every request (${code('io.modelcontextprotocol/protocolVersion')} and ${code('io.modelcontextprotocol/clientCapabilities')}); there is no ${code('initialize')} step. An ${code('initialize')} of an older revision is answered with error ${code('-32022')}, ${code('Unsupported protocol version: <revision>')}, and ${code('data.supported')} lists ${code(MCP_REVISION)}. The exact answers are in [Use an AI assistant and MCP safely](../guides/ai-and-mcp.md#the-protocol-revision).`,
      es: `El servidor habla la revisión ${MCP_REVISION} del protocolo y ninguna anterior: su punto de entrada inicia el transporte con ${code("legacy: 'reject'")}. Un cliente nombra la revisión y sus capacidades en el ${code('_meta')} de cada solicitud (${code('io.modelcontextprotocol/protocolVersion')} y ${code('io.modelcontextprotocol/clientCapabilities')}); no hay paso ${code('initialize')}. Un ${code('initialize')} de una revisión anterior se responde con el error ${code('-32022')}, ${code('Unsupported protocol version: <revisión>')}, y ${code('data.supported')} lista ${code(MCP_REVISION)}. Las respuestas exactas están en [Usar un asistente de IA y MCP con seguridad](../guides/ai-and-mcp.md#la-revisión-del-protocolo).`,
    },
    serve: {
      en: `The server serves the 2025 handshake (${code('initialize')}) as well as revision ${MCP_REVISION}: its entry point starts the transport with ${code("legacy: 'serve'")}.`,
      es: `El servidor atiende el apretón de manos de 2025 (${code('initialize')}) además de la revisión ${MCP_REVISION}: su punto de entrada inicia el transporte con ${code("legacy: 'serve'")}.`,
    },
  };
  const headings: Record<string, L10n> = {
    start: { en: 'Starting the server', es: 'Arranque del servidor' },
    revision: { en: 'Protocol revision', es: 'Revisión del protocolo' },
    tools: { en: 'Tools', es: 'Herramientas' },
    resources: { en: 'Resources', es: 'Recursos' },
  };
  const toolHead = lang === 'en' ? ['Tool', 'Title', 'Input', 'Read only', 'Description'] : ['Herramienta', 'Título', 'Entrada', 'Solo lectura', 'Descripción'];
  const resourceHead = lang === 'en' ? ['Resource', 'Kind'] : ['Recurso', 'Clase'];
  const yes: L10n = { en: 'yes', es: 'sí' };
  const no: L10n = { en: 'no', es: 'no' };
  const kind: Record<Lang, { fixed: string; template: string }> = { en: { fixed: 'fixed', template: 'template' }, es: { fixed: 'fijo', template: 'plantilla' } };
  return [
    intro[lang],
    fromSource(SOURCES.mcp, lang),
    `## ${headings.start![lang]}`,
    fence('text', usage),
    `## ${headings.revision![lang]}`,
    revision[legacy as 'reject' | 'serve'][lang],
    `## ${headings.tools![lang]}`,
    table(toolHead, mcp.tools.map((tool) => [
      code(tool.name), cell(tool.title), tool.inputs.length > 0 ? tool.inputs.map((input) => code(input)).join(', ') : '', tool.readOnly ? yes[lang] : no[lang], cell(tool.description),
    ])),
    `## ${headings.resources![lang]}`,
    table(resourceHead, mcp.resources.map((resource) => [code(resource.uri), resource.template ? kind[lang].template : kind[lang].fixed])),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// The runtime session protocol
// ---------------------------------------------------------------------------

const PROTOCOL_PARAMS: Record<string, string> = {
  address: 'Address in the VM memory.',
  length: 'Number of bytes.',
  bytes_hex: 'The bytes, as an upper-case hexadecimal string.',
  bytecode_hex: 'The program, as an upper-case hexadecimal string.',
  pc: 'Program counter of the instruction.',
  client_name: 'Name of the client.',
  client_version: 'Version of the client.',
  protocol_version: 'The protocol version the client speaks; it must be the one above.',
  input_id: 'Name of the simulated input.',
  active: 'The value of the input.',
  program_generation: 'The generation of the loaded program that the input belongs to.',
  at_ms: 'Time of the scan, in milliseconds of virtual time.',
};

export function protocolErrors(): string[] {
  const protocol = parseProtocol(read(SOURCES.protocol));
  const errors: string[] = [];
  for (const method of protocol.methods) {
    for (const param of method.params) if (!(param in PROTOCOL_PARAMS)) errors.push(`${SOURCES.protocol}: the parameter ${param} of ${method.method} has no description in ${GENERATOR}`);
  }
  return errors;
}

export function protocolBody(lang: Lang): string {
  const protocol = parseProtocol(read(SOURCES.protocol));
  const intro: L10n = {
    en: `The native POSIX runtime, the one that simulations and CI use, is a process that speaks one JSON request per line on standard input and answers on standard output. This is protocol version ${code(protocol.version)}: ${protocol.methods.length} methods. A request has an ${code('id')}, a ${code('type')} of ${code('request')}, a ${code('method')} and a ${code('params')} object; every parameter listed for a method is required and no other is accepted. The device shell is a different interface: see the [shell commands](./shell-commands.md).`,
    es: `El runtime POSIX nativo, el que usan las simulaciones y CI, es un proceso que recibe una solicitud JSON por línea en la entrada estándar y responde en la salida estándar. Esta es la versión ${code(protocol.version)} del protocolo: ${protocol.methods.length} métodos. Una solicitud tiene un ${code('id')}, un ${code('type')} con valor ${code('request')}, un ${code('method')} y un objeto ${code('params')}; cada parámetro indicado para un método es obligatorio y no se acepta ningún otro. La consola del dispositivo es otra interfaz: véanse los [comandos de la consola](./shell-commands.md).`,
  };
  const head = lang === 'en' ? ['Method', 'Parameters'] : ['Método', 'Parámetros'];
  const paramHead = lang === 'en' ? ['Parameter', 'Meaning'] : ['Parámetro', 'Significado'];
  const used = [...new Set(protocol.methods.flatMap((method) => method.params))];
  const headings: Record<string, L10n> = { methods: { en: 'Methods', es: 'Métodos' }, params: { en: 'Parameters', es: 'Parámetros' } };
  const none: L10n = { en: 'none', es: 'ninguno' };
  return [
    intro[lang],
    fromSource(SOURCES.protocol, lang),
    `## ${headings.methods![lang]}`,
    table(head, protocol.methods.map((method) => [code(method.method), method.params.length > 0 ? method.params.map((param) => code(param)).join(', ') : none[lang]])),
    `## ${headings.params![lang]}`,
    table(paramHead, used.map((param) => [code(param), prose(PROTOCOL_PARAMS[param] ?? '')])),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const PAGES: ReferencePage[] = [
  {
    path: 'reference/kconfig.md',
    title: { en: 'Kconfig options', es: 'Opciones de Kconfig' },
    label: { en: 'Kconfig options', es: 'Opciones de Kconfig' },
    description: { en: 'Every Kconfig symbol of the ZPLC runtime module, read off its Kconfig file.', es: 'Todos los símbolos de Kconfig del módulo del runtime ZPLC, leídos de su archivo Kconfig.' },
    body: kconfigBody,
  },
  {
    path: 'reference/shell-commands.md',
    title: { en: 'Shell commands', es: 'Comandos de la consola' },
    label: { en: 'Shell commands', es: 'Comandos de la consola' },
    description: { en: 'Every subcommand of the zplc device shell command, read off its command table.', es: 'Todos los subcomandos del comando zplc de la consola del dispositivo, leídos de su tabla de comandos.' },
    body: shellBody,
  },
  {
    path: 'reference/project-file.md',
    title: { en: 'Project file (zplc.json)', es: 'Archivo de proyecto (zplc.json)' },
    label: { en: 'Project file', es: 'Archivo de proyecto' },
    description: { en: 'Every field of zplc.json, read off its JSON schema.', es: 'Todos los campos de zplc.json, leídos de su esquema JSON.' },
    body: schemaBody,
  },
  {
    path: 'reference/scenario-file.md',
    title: { en: 'Scenario file format', es: 'Formato del archivo de escenario' },
    label: { en: 'Scenario files', es: 'Archivos de escenario' },
    description: { en: 'The fields, expectation kinds and limits of a scenario test file.', es: 'Los campos, las clases de expectativa y los límites de un archivo de prueba de escenario.' },
    body: scenarioBody,
  },
  {
    path: 'reference/cli.md',
    title: { en: 'Command line', es: 'Línea de comandos' },
    label: { en: 'Command line', es: 'Línea de comandos' },
    description: { en: 'Every command, option and exit code of zplc-cli, read off its source.', es: 'Cada comando, opción y código de salida de zplc-cli, leídos de su fuente.' },
    body: cliBody,
  },
  {
    path: 'reference/mcp.md',
    title: { en: 'MCP tools and resources', es: 'Herramientas y recursos MCP' },
    label: { en: 'MCP server', es: 'Servidor MCP' },
    description: { en: 'Every tool and resource of the local zplc-mcp server, read off its source.', es: 'Cada herramienta y recurso del servidor local zplc-mcp, leídos de su fuente.' },
    body: mcpBody,
  },
  {
    path: 'reference/runtime-protocol.md',
    title: { en: 'Runtime session protocol', es: 'Protocolo de sesión del runtime' },
    label: { en: 'Session protocol', es: 'Protocolo de sesión' },
    description: { en: 'The request methods of the native POSIX runtime session, read off its source.', es: 'Los métodos de solicitud de la sesión del runtime POSIX nativo, leídos de su fuente.' },
    body: protocolBody,
  },
];

export function sourceErrors(): string[] {
  return [...scenarioErrors(), ...cliErrors(), ...protocolErrors()];
}

if (import.meta.main) {
  const errors = sourceErrors();
  process.exit(runGenerator(GENERATOR, errors.length > 0 ? [] : outputsOf(GENERATOR, PAGES), process.argv.slice(2), errors));
}
