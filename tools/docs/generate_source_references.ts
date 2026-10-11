// The references that are read off a source file (DOC-008): Kconfig options, shell commands, the zplc.json schema, the
// scenario file format, the command line, the MCP server, the runtime session protocol and the device link protocol
// (COM-029). (The runtime C API and the boards have their own generators,
// tools/docs/generate_runtime_reference.py and generate_board_reference.py.)
//
//   bun tools/docs/generate_source_references.ts           write the eight pages and their Spanish twins
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
  deviceProtocol: 'tools/contract/protocol.json',
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
    en: `${code('zplc-cli')} is the command line of the ZPLC tool API, the same operations that Studio and the [MCP server](./mcp.md) use: ${names.length} commands. It never flashes, deploys, forces or runs a device. Every command takes a workspace folder (or, for a build, a repository root); ${code('--json')} prints one line of JSON, with the evidence of the operation, instead of text.`,
    es: `${code('zplc-cli')} es la línea de comandos de la API de herramientas de ZPLC, las mismas operaciones que usan Studio y el [servidor MCP](./mcp.md): ${names.length} comandos. Nunca graba, despliega, fuerza ni pone en marcha un dispositivo. Cada comando recibe una carpeta de espacio de trabajo (o, para una compilación, la raíz del repositorio); ${code('--json')} imprime una línea de JSON, con la evidencia de la operación, en lugar de texto.`,
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
// The device link protocol (COM-019, COM-029)
// ---------------------------------------------------------------------------

interface DeviceProtocolField { name: string; type: string; enum?: string; doc: string }
interface DeviceProtocolMessage { name: string; id: number; access: string; summary: L10n; request: DeviceProtocolField[]; response: DeviceProtocolField[] }
interface DeviceProtocolEvent { name: string; id: number; mask: string | null; summary: L10n; fields: DeviceProtocolField[] }
interface DeviceProtocolEnum { name: string; doc: string; members: { name: string; value: number; doc: string }[] }
interface DeviceProtocol {
  version: number;
  frame: {
    sync: number[]; headerBytes: number; macBytes: number; crcBytes: number;
    header: { name: string; offset: number; size: number; doc: string }[];
    kinds: { name: string; value: number; doc: string }[];
  };
  limits: Record<string, number>;
  enums: DeviceProtocolEnum[];
  errors: { name: string; value: number; doc: L10n }[];
  capabilities: { name: string; bit: number; doc: L10n }[];
  eventMask: { name: string; bit: number; doc: string }[];
  access: { name: string; doc: L10n }[];
  rangeDetail: { name: string; type: string; doc: string }[];
  messages: DeviceProtocolMessage[];
  events: DeviceProtocolEvent[];
}

const hexByte = (value: number, width = 2) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const parseDeviceProtocol = (): DeviceProtocol => JSON.parse(read(SOURCES.deviceProtocol)) as DeviceProtocol;

const FRAME_RULES: Record<'en' | 'es', string[]> = {
  en: [
    'All numbers are little-endian. A frame is the header, the payload, a 32-byte HMAC-SHA-256 code when the AUTH flag is set, and a CRC-32 (the CRC of the artifact container, ISO-HDLC) of every byte before it.',
    'A decoder that reads a stream keeps the bytes of the frame it is assembling. When the header is not valid (sync, version, reserved bits, kind 3, length above its limit) or the checksum does not match, it discards the first byte of that candidate, looks for the next sync pair among the bytes it already holds, and goes on from there. A frame that was hidden inside the bytes of a damaged one is therefore delivered, and no frame after a damaged one is lost. Bytes that are not a sync pair are noise and are not counted; every abandoned candidate is counted, by reason.',
    'A transport that frames its own lines (one frame per line, in hexadecimal, as the device shell does) hands each line to the decoder whole.',
    'The code covers the header and the payload, so the sequence number and the direction of the frame are inside it. The checksum covers everything before it, the code included.',
  ],
  es: [
    'Todos los números son little-endian. Una trama es el encabezado, la carga útil, un código HMAC-SHA-256 de 32 bytes cuando la bandera AUTH está activa, y un CRC-32 (el CRC del contenedor de artefacto, ISO-HDLC) de todos los bytes anteriores.',
    'Un decodificador que lee un flujo conserva los bytes de la trama que está armando. Cuando el encabezado no es válido (sincronía, versión, bits reservados, clase 3, longitud sobre su límite) o la suma de verificación no coincide, descarta el primer byte de ese candidato, busca el siguiente par de sincronía entre los bytes que ya tiene y continúa desde ahí. Una trama escondida dentro de los bytes de una dañada se entrega, y ninguna trama posterior a una dañada se pierde. Los bytes que no son un par de sincronía son ruido y no se cuentan; cada candidato abandonado se cuenta, por motivo.',
    'Un transporte que enmarca sus propias líneas (una trama por línea, en hexadecimal, como hace la consola del dispositivo) entrega cada línea completa al decodificador.',
    'El código cubre el encabezado y la carga útil, de modo que el número de secuencia y el sentido de la trama quedan dentro. La suma de verificación cubre todo lo anterior, el código incluido.',
  ],
};

const SESSION_TEXT: Record<Lang, string[]> = {
  en: [
    'Everything that changes the device needs a session that is open on the link the request arrives on: a download, RUN and STOP and the other run controls, a memory write, a force, a configuration change, a credential upload and the key. A request that needs one and has none is answered `NO_SESSION` and reaches nothing. Reads of the runtime need no session on the serial link.',
    'One session is open at a time. It ends when its client closes it, when nothing arrives for the idle time (reported in the hello, 30 seconds by default; every frame of the session, a `KEEPALIVE` included, restarts it), when its link is lost, when a person at the serial link takes it over (`SESSION_OPEN` with the takeover flag; a network link cannot take a session over) and when the key is changed. The device sends a `EVT_SESSION_END` to the link that held it, and a second `SESSION_OPEN` while one is open is answered `SESSION_BUSY`.',
    'The forces a session set end with it, whatever the reason, and the outputs follow the program again. A force that was set outside a session (by the shell) is not the session\'s to release. A force that must survive is set again in the next session.',
    'A multi-byte value is written with one `MEM_WRITE`: the device queues it whole and the scan applies it at its next input latch, so a program never reads half of it. A download is `PROGRAM_BEGIN` (size and CRC-32), `PROGRAM_CHUNK` in order, and `PROGRAM_COMMIT`, which checks the CRC-32, verifies and activates the artifact and answers with the size and CRC-32 that the device read back from what it holds. The runtime is stopped before, and stays stopped after: RUN is another request.',
    'A device that was given a public key with `SIGNING_KEY_SET` (over the serial link) accepts only a program that was signed with the matching private key: the Ed25519 signature (RFC 8032) of the whole artifact is sent with `PROGRAM_SIGN` after the last chunk, and `PROGRAM_COMMIT` verifies it first. An unsigned program is refused with `SIGNATURE_REQUIRED`, one that is not a signature of this artifact with `SIGNATURE_INVALID`; the text shell refuses an upload while the device holds a key. The hello says whether signatures are required. A device that cannot verify does not offer the capability.',
  ],
  es: [
    'Todo lo que cambia el dispositivo necesita una sesión abierta en el enlace por el que llega la solicitud: una descarga, RUN y STOP y los demás controles de ejecución, una escritura de memoria, un forzado, un cambio de configuración, la subida de una credencial y la clave. Una solicitud que la necesita y no la tiene recibe `NO_SESSION` y no llega a nada. Las lecturas del runtime no necesitan sesión en el enlace serie.',
    'Hay una sola sesión abierta a la vez. Termina cuando su cliente la cierra, cuando no llega nada durante el tiempo de inactividad (se informa en el saludo, 30 segundos por defecto; cada trama de la sesión, un `KEEPALIVE` incluido, lo reinicia), cuando se pierde su enlace, cuando una persona en el enlace serie la toma (`SESSION_OPEN` con la bandera de toma de control; un enlace de red no puede tomar una sesión) y cuando se cambia la clave. El dispositivo envía un `EVT_SESSION_END` al enlace que la tenía, y un segundo `SESSION_OPEN` con una abierta recibe `SESSION_BUSY`.',
    'Los forzados que fijó una sesión terminan con ella, sea cual sea el motivo, y las salidas vuelven a seguir al programa. Un forzado fijado fuera de una sesión (por la consola) no le corresponde liberarlo a la sesión. Un forzado que debe sobrevivir se fija otra vez en la sesión siguiente.',
    'Un valor de varios bytes se escribe con un solo `MEM_WRITE`: el dispositivo lo encola completo y el ciclo lo aplica en su siguiente latch de entradas, de modo que un programa nunca lee la mitad. Una descarga es `PROGRAM_BEGIN` (tamaño y CRC-32), `PROGRAM_CHUNK` en orden y `PROGRAM_COMMIT`, que comprueba el CRC-32, verifica y activa el artefacto y responde con el tamaño y el CRC-32 que el dispositivo leyó de lo que tiene. El runtime está detenido antes y sigue detenido después: RUN es otra solicitud.',
    'Un dispositivo al que se le dio una clave pública con `SIGNING_KEY_SET` (por el enlace serie) acepta solo un programa firmado con la clave privada correspondiente: la firma Ed25519 (RFC 8032) del artefacto completo se envía con `PROGRAM_SIGN` después del último fragmento, y `PROGRAM_COMMIT` la verifica primero. Un programa sin firma se rechaza con `SIGNATURE_REQUIRED`, uno cuya firma no es de este artefacto con `SIGNATURE_INVALID`; la consola de texto rechaza una subida mientras el dispositivo tiene una clave. El saludo dice si se exigen firmas. Un dispositivo que no puede verificar no ofrece la capacidad.',
  ],
};

const AUTH_TEXT: Record<Lang, string[]> = {
  en: [
    'A link is `SERIAL` (UART or USB serial) or `NETWORK` (TCP, or any link a network reaches); the device decides which, and says so in the hello. On a network link every message except `HELLO`, `IDENTITY`, `CHALLENGE` and `LINK_STATS` needs a session that was opened with a code, and every frame of that session carries a code: HMAC-SHA-256, 32 bytes, over the header and the payload, so over the kind, the message number and the sequence number as well.',
    'The key (32 bytes) is provisioned over the serial link, inside a session, with `KEY_SET`; it is never accepted over a network link and the device never sends it back. To open a session over the network the client asks for a `CHALLENGE` (a 16-byte number the device will accept once, in the next ten seconds, and keeps until it is used or has expired), then sends `SESSION_OPEN` with that number, a number of its own, and a code under the key. The device derives the key of the session as HMAC-SHA-256 of the string `ZPLC-LINK-SK1`, the number of the device and the number of the client, under the key of the device; its answer and every later frame, in both directions, carry a code under that session key. The session key is erased when the session ends.',
    'The sequence number of the first frame after the open is the one of the open plus one, and each request after it is the previous plus one. A frame whose code is wrong or missing, whose sequence number is one that was already accepted (a replay), or is not the next one (out of order), is dropped, counted in `LINK_STATS` (`auth_drops`, `replay_drops`, `order_drops`) and not answered; it does not move the sequence. An open that carries a challenge that is not the current one is a replay too: it is counted and answered `CHALLENGE_STALE`.',
  ],
  es: [
    'Un enlace es `SERIAL` (UART o USB serie) o `NETWORK` (TCP, o cualquier enlace al que llegue una red); el dispositivo decide cuál, y lo dice en el saludo. En un enlace de red todos los mensajes salvo `HELLO`, `IDENTITY`, `CHALLENGE` y `LINK_STATS` necesitan una sesión que se abrió con un código, y cada trama de esa sesión lleva un código: HMAC-SHA-256, 32 bytes, sobre el encabezado y la carga útil, es decir también sobre la clase, el número de mensaje y el número de secuencia.',
    'La clave (32 bytes) se aprovisiona por el enlace serie, dentro de una sesión, con `KEY_SET`; nunca se acepta por un enlace de red y el dispositivo nunca la devuelve. Para abrir una sesión por la red el cliente pide un `CHALLENGE` (un número de 16 bytes que el dispositivo aceptará una vez, en los próximos diez segundos, y conserva hasta que se usa o vence), y envía `SESSION_OPEN` con ese número, un número propio y un código bajo la clave. El dispositivo deriva la clave de la sesión como HMAC-SHA-256 de la cadena `ZPLC-LINK-SK1`, el número del dispositivo y el número del cliente, bajo la clave del dispositivo; su respuesta y cada trama posterior, en ambos sentidos, llevan un código bajo esa clave de sesión. La clave de sesión se borra cuando la sesión termina.',
    'El número de secuencia de la primera trama tras la apertura es el de la apertura más uno, y cada solicitud posterior es la anterior más uno. Una trama cuyo código es erróneo o falta, cuyo número de secuencia ya fue aceptado (una repetición) o no es el siguiente (fuera de orden), se descarta, se cuenta en `LINK_STATS` (`auth_drops`, `replay_drops`, `order_drops`) y no se responde; no mueve la secuencia. Una apertura con un desafío que no es el vigente también es una repetición: se cuenta y se responde `CHALLENGE_STALE`.',
  ],
};

const TRUST_TEXT: Record<Lang, string[]> = {
  en: [
    '**The serial link is trusted like the person who holds the cable.** A UART or USB port is physical access: whoever has it can already stop the device, read its memory through the shell and reflash it. The session on the serial link keeps two clients from writing at once and makes a write, a force or a download an explicit step; it is not a defence against someone at the port, and it does not need a code. The key of the network sessions is provisioned over this link, and only over this link, for the same reason: the person at the cable is the one who decides who may reach the device over the network.',
    '**The network link is not trusted.** A peer without the key can send anything it likes: it reaches nothing, is not answered and is counted. What the code does not give is secrecy (frames are not encrypted: where confidentiality matters, run the link inside a TLS tunnel), availability (a peer on the network can flood the link and make the device spend time dropping frames, below the priority of the scan) or a hidden device: the hello, the identity and the counters are answered to anyone.',
    '**The key.** It is 256 bits, held by the device in its persistent store where the board has protected storage and in plain flash where it does not; the documentation of each board says which. It is not in any answer, any log line or the hello (which says only whether one is held), the buffers that held it are cleared, and erasing or changing it ends a session. The numbers of a challenge and of a session come from the cryptographic source of the platform: a build that has none does not offer authenticated sessions.',
  ],
  es: [
    '**El enlace serie es confiable como la persona que sostiene el cable.** Un puerto UART o USB es acceso físico: quien lo tiene ya puede detener el dispositivo, leer su memoria con la consola y regrabarlo. La sesión del enlace serie evita que dos clientes escriban a la vez y hace de una escritura, un forzado o una descarga un paso explícito; no es una defensa contra alguien en el puerto, y no necesita un código. La clave de las sesiones de red se aprovisiona por este enlace, y solo por este enlace, por la misma razón: la persona que está en el cable es quien decide quién puede llegar al dispositivo por la red.',
    '**El enlace de red no es confiable.** Un par sin la clave puede enviar lo que quiera: no llega a nada, no recibe respuesta y se cuenta. Lo que el código no da es secreto (las tramas no se cifran: donde importa la confidencialidad, el enlace va dentro de un túnel TLS), disponibilidad (un par en la red puede inundar el enlace y hacer que el dispositivo gaste tiempo descartando tramas, por debajo de la prioridad del ciclo) ni un dispositivo oculto: el saludo, la identidad y los contadores se responden a cualquiera.',
    '**La clave.** Tiene 256 bits, y el dispositivo la guarda en su almacén persistente donde la placa tiene almacenamiento protegido y en flash sin proteger donde no lo tiene; la documentación de cada placa dice cuál. No está en ninguna respuesta, ninguna línea de registro ni en el saludo (que solo dice si hay una), los búferes que la contuvieron se borran, y borrarla o cambiarla termina una sesión. Los números de un desafío y de una sesión salen de la fuente criptográfica de la plataforma: una compilación que no la tiene no ofrece sesiones autenticadas.',
  ],
};

export function deviceProtocolBody(lang: Lang): string {
  const p = parseDeviceProtocol();
  const intro: L10n = {
    en: `The device link protocol is how Studio and a device talk: a framed, versioned binary protocol with a length, a sequence number and a checksum on every frame, capability negotiation and explicit error codes. It runs over UART, USB serial and TCP. This is protocol version ${code(String(p.version))}: ${p.messages.length} messages and ${p.events.length} events. The text shell of the device stays: it is the older protocol and the recovery console, and ${code('zplc sys info --json')} keeps its keys. This page is read off ${code(SOURCES.deviceProtocol)}, the one definition the C codec of the firmware and the TypeScript codec of Studio are generated from. The native runtime speaks the same protocol on standard input and output when it is started with ${code('--device-link')}; ${code('--device-link-network')} applies the rules of a network link to it, so that they can be exercised without a socket.`,
    es: `El protocolo de enlace con el dispositivo es como hablan Studio y un dispositivo: un protocolo binario con tramas y versión, con longitud, número de secuencia y suma de verificación en cada trama, negociación de capacidades y códigos de error explícitos. Funciona sobre UART, USB serie y TCP. Esta es la versión ${code(String(p.version))} del protocolo: ${p.messages.length} mensajes y ${p.events.length} eventos. La consola de texto del dispositivo se mantiene: es el protocolo anterior y la consola de recuperación, y ${code('zplc sys info --json')} conserva sus claves. Esta página se lee de ${code(SOURCES.deviceProtocol)}, la definición única de la que se generan el códec C del firmware y el códec TypeScript de Studio. El runtime nativo habla el mismo protocolo por la entrada y la salida estándar cuando se inicia con ${code('--device-link')}; ${code('--device-link-network')} le aplica las reglas de un enlace de red, para poder ejercitarlas sin un socket.`,
  };
  const h = (en: string, es: string) => `## ${lang === 'en' ? en : es}`;
  const h3 = (text: string) => `### ${text}`;
  const fieldHead = lang === 'en' ? ['Field', 'Type', 'Meaning'] : ['Campo', 'Tipo', 'Significado'];
  const bytesOf = (size: number) => (size === 1 ? '1 byte' : `${size} bytes`);
  const typeOf = (field: DeviceProtocolField) => {
    const named = field.enum ? `${field.type} (${field.enum})` : field.type;
    return code(named);
  };
  const messageSection = (message: DeviceProtocolMessage): string => {
    const parts = [h3(`${message.name} (${hexByte(message.id)})`), `${prose(loc(message.summary, lang))} ${lang === 'en' ? 'Access' : 'Acceso'}: ${code(message.access)}.`];
    const none = lang === 'en' ? 'no fields' : 'sin campos';
    parts.push(lang === 'en' ? '**Request**' : '**Solicitud**');
    parts.push(message.request.length === 0 ? none : table(fieldHead, message.request.map((f) => [code(f.name), typeOf(f), cell(f.doc)])));
    parts.push(lang === 'en' ? '**Response** (after the status byte)' : '**Respuesta** (después del byte de estado)');
    parts.push(message.response.length === 0 ? none : table(fieldHead, message.response.map((f) => [code(f.name), typeOf(f), cell(f.doc)])));
    return parts.join('\n\n');
  };
  const enumRows = p.enums.flatMap((e) => e.members.map((m) => [code(e.name), code(m.name), String(m.value), cell(m.doc)]));
  const sessionRows = p.messages.filter((m) => m.access === 'SESSION' || m.access === 'SERIAL_SESSION').map((m) => code(m.name)).join(', ');
  const sessionList: L10n = {
    en: `The messages that need a session: ${sessionRows}. ${code('KEY_SET')} and ${code('KEY_CLEAR')} also need the serial link.`,
    es: `Los mensajes que necesitan una sesión: ${sessionRows}. ${code('KEY_SET')} y ${code('KEY_CLEAR')} necesitan además el enlace serie.`,
  };
  return [
    intro[lang],
    h('Sessions', 'Sesiones'),
    SESSION_TEXT[lang].join('\n\n'),
    sessionList[lang],
    h('Authentication on a network link', 'Autenticación en un enlace de red'),
    AUTH_TEXT[lang].join('\n\n'),
    h('Trust model', 'Modelo de confianza'),
    TRUST_TEXT[lang].join('\n\n'),
    h('Frame', 'Trama'),
    table(lang === 'en' ? ['Field', 'Offset', 'Bytes', 'Meaning'] : ['Campo', 'Desplazamiento', 'Bytes', 'Significado'],
      p.frame.header.map((f) => [code(f.name), String(f.offset), bytesOf(f.size), cell(f.doc)])),
    table(lang === 'en' ? ['Kind', 'Value', 'Meaning'] : ['Clase', 'Valor', 'Significado'],
      p.frame.kinds.map((k) => [code(k.name), String(k.value), cell(k.doc)])),
    `${lang === 'en' ? 'Sync bytes' : 'Bytes de sincronía'}: ${p.frame.sync.map((b) => code(hexByte(b))).join(' ')}. ${lang === 'en' ? 'Code' : 'Código'}: ${bytesOf(p.frame.macBytes)}. CRC-32: ${bytesOf(p.frame.crcBytes)}.`,
    FRAME_RULES[lang].join('\n\n'),
    h('Limits', 'Límites'),
    table(lang === 'en' ? ['Limit', 'Value'] : ['Límite', 'Valor'], Object.entries(p.limits).map(([name, value]) => [code(name), String(value)])),
    h('Capabilities', 'Capacidades'),
    table(lang === 'en' ? ['Capability', 'Bit', 'Meaning'] : ['Capacidad', 'Bit', 'Significado'],
      p.capabilities.map((c) => [code(c.name), String(c.bit), cell(loc(c.doc, lang))])),
    h('Access classes', 'Clases de acceso'),
    table(lang === 'en' ? ['Class', 'Meaning'] : ['Clase', 'Significado'], p.access.map((a) => [code(a.name), cell(loc(a.doc, lang))])),
    h('Error codes', 'Códigos de error'),
    table(lang === 'en' ? ['Error', 'Value', 'Meaning'] : ['Error', 'Valor', 'Significado'],
      p.errors.map((e) => [code(e.name), String(e.value), cell(loc(e.doc, lang))])),
    (lang === 'en'
      ? `A response starts with its status byte. After ${code('RANGE')} the response carries ${p.rangeDetail.map((d) => code(d.name)).join(', ')} (${code('u16')} each): the access that was refused and the region that holds the address.`
      : `Una respuesta empieza con su byte de estado. Tras ${code('RANGE')} la respuesta lleva ${p.rangeDetail.map((d) => code(d.name)).join(', ')} (${code('u16')} cada uno): el acceso que se rechazó y la región que contiene la dirección.`),
    h('Enumerations', 'Enumeraciones'),
    table(lang === 'en' ? ['Enumeration', 'Name', 'Value', 'Meaning'] : ['Enumeración', 'Nombre', 'Valor', 'Significado'], enumRows),
    h('Event mask', 'Máscara de eventos'),
    table(lang === 'en' ? ['Event kind', 'Bit', 'Meaning'] : ['Clase de evento', 'Bit', 'Significado'],
      p.eventMask.map((m) => [code(m.name), String(m.bit), cell(m.doc)])),
    h('Messages', 'Mensajes'),
    table(lang === 'en' ? ['Message', 'Number', 'Access', 'Meaning'] : ['Mensaje', 'Número', 'Acceso', 'Significado'],
      p.messages.map((m) => [code(m.name), hexByte(m.id), code(m.access), cell(loc(m.summary, lang))])),
    ...p.messages.map(messageSection),
    h('Events', 'Eventos'),
    table(lang === 'en' ? ['Event', 'Number', 'Mask bit', 'Fields', 'Meaning'] : ['Evento', 'Número', 'Bit de máscara', 'Campos', 'Significado'],
      p.events.map((e) => [code(e.name), hexByte(e.id), e.mask === null ? (lang === 'en' ? 'always' : 'siempre') : code(e.mask),
        e.fields.map((f) => `${code(f.name)} (${code(f.type)})`).join(', '), cell(loc(e.summary, lang))])),
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
  {
    path: 'reference/device-protocol.md',
    title: { en: 'Device link protocol', es: 'Protocolo de enlace con el dispositivo' },
    label: { en: 'Device link protocol', es: 'Protocolo de enlace' },
    description: { en: 'The framed protocol that Studio and a device speak: frame, limits, capabilities, errors, messages and events, read off its definition.', es: 'El protocolo con tramas que hablan Studio y un dispositivo: trama, límites, capacidades, errores, mensajes y eventos, leídos de su definición.' },
    body: deviceProtocolBody,
  },
];

export function sourceErrors(): string[] {
  return [...scenarioErrors(), ...cliErrors(), ...protocolErrors()];
}

if (import.meta.main) {
  const errors = sourceErrors();
  process.exit(runGenerator(GENERATOR, errors.length > 0 ? [] : outputsOf(GENERATOR, PAGES), process.argv.slice(2), errors));
}
