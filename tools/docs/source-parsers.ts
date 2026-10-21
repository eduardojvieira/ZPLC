// Readers of the sources that the generated references (DOC-008) and the claim checker (DOC-014) describe.
//
// Each reader takes the text of one source and returns data; none touches the file system, so each is tested on a
// small fixture and the callers read the real file. A reader that cannot understand its source throws: a reference that
// silently lists less than the source holds would be worse than no reference.
//
//   parseKconfig        firmware/zephyr/Kconfig      symbols, their type, prompt, default, range and the symbols they depend on
//   parseShellCommands  firmware/app/src/shell_cmds.c    the command tree of the `zplc` shell command
//   parseCli            packages/zplc-ide/src/cli/index.ts    the usage lines, the options and the exit codes
//   parseMcp            packages/zplc-ide/src/mcp/server.ts   tools, their input fields, and resources
//   parseScenarioFormat packages/zplc-ide/src/test-engine/index.ts   the fields, kinds and limits of a scenario file
//   parseProtocol       firmware/apps/posix_host/src/native_runtime_session.c   the request methods and their parameters

import { flattenConcatenations } from '../ci/source-text';

// ---------------------------------------------------------------------------
// Kconfig
// ---------------------------------------------------------------------------

export interface KconfigSymbol {
  name: string;
  type: 'bool' | 'int' | 'hex' | 'string';
  prompt: string;
  defaults: string[];
  range?: [string, string];
  /** `depends on` of the symbol and every enclosing `if`, in source order. */
  depends: string[];
  help: string;
}

const KCONFIG_TYPES = ['bool', 'int', 'hex', 'string'] as const;

export function parseKconfig(text: string): KconfigSymbol[] {
  const symbols: KconfigSymbol[] = [];
  const conditions: string[] = [];
  let current: KconfigSymbol | undefined;
  let helpIndent: number | undefined;
  let inHelp = false;
  const lines = text.split('\n');
  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (inHelp) {
      if (line === '') { if (current && current.help !== '') current.help += '\n'; continue; }
      if (helpIndent === undefined) helpIndent = indent;
      if (indent >= helpIndent && current) {
        current.help += `${current.help === '' || current.help.endsWith('\n') ? '' : ' '}${line}`;
        continue;
      }
      inHelp = false;
    }
    if (line === '' || line.startsWith('#')) continue;
    const [keyword = '', ...rest] = line.split(/\s+/);
    const argument = rest.join(' ');
    if (keyword === 'config' || keyword === 'menuconfig') {
      current = { name: argument, type: 'bool', prompt: '', defaults: [], depends: [...conditions], help: '' };
      symbols.push(current);
    } else if (keyword === 'if') {
      conditions.push(argument);
      current = undefined;
    } else if (keyword === 'endif') {
      conditions.pop();
      current = undefined;
    } else if (keyword === 'menu' || keyword === 'endmenu' || keyword === 'source' || keyword === 'comment' || keyword === 'choice' || keyword === 'endchoice') {
      current = undefined;
    } else if (current) {
      if ((KCONFIG_TYPES as readonly string[]).includes(keyword)) {
        current.type = keyword as KconfigSymbol['type'];
        const prompt = /^"(.*)"/.exec(argument);
        if (prompt) current.prompt = prompt[1]!;
      } else if (keyword === 'default') current.defaults.push(argument.replace(/\s+if\s.*$/, ''));
      else if (keyword === 'range') {
        const [low, high] = argument.split(/\s+/);
        if (low !== undefined && high !== undefined) current.range = [low, high];
      } else if (keyword === 'depends') current.depends.push(argument.replace(/^on\s+/, ''));
      else if (keyword === 'help') { inHelp = true; helpIndent = undefined; }
      else if (keyword === 'prompt') current.prompt = argument.replace(/^"|"$/g, '');
    }
  }
  return symbols;
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

export interface ShellCommand {
  /** Words of the command, `zplc` first: `['zplc', 'dbg', 'bp', 'add']`. */
  path: string[];
  help: string;
  /** Words required after the command name, and optional ones. Absent for a group. */
  required?: number;
  optional?: number;
  group: boolean;
  /** Kconfig symbols (without the CONFIG_ prefix) whose `#ifdef` encloses the command. */
  when: string[];
}

interface ShellEntry { name: string; set: string | undefined; help: string; required?: number; optional?: number; when: string[] }

const SHELL_ENTRY = /^\s*SHELL_CMD(_ARG)?\(\s*(\w+)\s*,\s*(&?\w+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*(\w+)\s*(?:,\s*(\d+)\s*,\s*(\d+)\s*)?\)\s*,?\s*$/;

export function parseShellCommands(text: string): ShellCommand[] {
  const sets = new Map<string, ShellEntry[]>();
  const guards: string[] = [];
  let open: ShellEntry[] | undefined;
  let root: { name: string; set: string; help: string } | undefined;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const ifdef = /^\s*#\s*ifdef\s+(\w+)/.exec(line);
    if (ifdef) { guards.push(ifdef[1]!.replace(/^CONFIG_/, '')); continue; }
    if (/^\s*#\s*(ifndef|if)\b/.test(line)) { guards.push(''); continue; }
    if (/^\s*#\s*endif/.test(line)) { guards.pop(); continue; }
    if (/^\s*#\s*else\b/.test(line)) { guards[guards.length - 1] = ''; continue; }
    const start = /^\s*SHELL_STATIC_SUBCMD_SET_CREATE\(\s*$/.test(line) || /^\s*SHELL_STATIC_SUBCMD_SET_CREATE\(\s*(\w+)\s*,\s*$/.test(line);
    if (start) {
      const inline = /\(\s*(\w+)\s*,\s*$/.exec(line);
      const nameLine = inline ? inline[1]! : (lines[++index] ?? '').trim().replace(/,$/, '');
      open = [];
      sets.set(nameLine, open);
      continue;
    }
    if (/SHELL_SUBCMD_SET_END/.test(line)) { open = undefined; continue; }
    const registered = /SHELL_CMD_REGISTER\(\s*(\w+)\s*,\s*&(\w+)\s*,\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    if (registered) { root = { name: registered[1]!, set: registered[2]!, help: registered[3]! }; continue; }
    if (open) {
      const entry = SHELL_ENTRY.exec(line);
      if (entry) {
        const [, arg, name, set, help, , required, optional] = entry;
        open.push({
          name: name!,
          set: set === 'NULL' ? undefined : set!.replace(/^&/, ''),
          help: help!,
          ...(arg ? { required: Number(required), optional: Number(optional) } : {}),
          when: guards.filter((guard) => guard !== ''),
        });
      }
    }
  }
  if (!root) throw new Error('shell_cmds.c: no SHELL_CMD_REGISTER found');
  const result: ShellCommand[] = [{ path: [root.name], help: root.help, group: true, when: [] }];
  const walk = (set: string, prefix: string[], inherited: string[]) => {
    const entries = sets.get(set);
    if (!entries) throw new Error(`shell_cmds.c: the subcommand set ${set} is used and never defined`);
    for (const entry of entries) {
      const path = [...prefix, entry.name];
      const group = entry.set !== undefined;
      // a subcommand is there only while its group is
      const when = [...new Set([...inherited, ...entry.when])];
      result.push({
        path,
        help: entry.help,
        group,
        ...(entry.required === undefined || group ? {} : { required: Math.max(entry.required - 1, 0), optional: entry.optional ?? 0 }),
        when,
      });
      if (entry.set) walk(entry.set, path, when);
    }
  };
  walk(root.set, [root.name], []);
  return result;
}

// ---------------------------------------------------------------------------
// The command line
// ---------------------------------------------------------------------------

export interface CliCommand { name: string; usage: string }
export interface CliOption { flags: string; description: string }
export interface Cli { commands: CliCommand[]; options: CliOption[]; exitCodes: Array<{ code: number; meaning: string }>; footnote: string }

export function parseCli(source: string): Cli {
  const text = flattenConcatenations(source);
  const help = /printHelp\([^)]*\)[^{]*\{\s*output\.log\(\s*`([\s\S]*?)`\);/.exec(text);
  if (!help) throw new Error('cli/index.ts: printHelp was not found');
  const lines = help[1]!.replace(/\\n/g, '\n').split('\n');
  const commands: CliCommand[] = [];
  const options: CliOption[] = [];
  let section = '';
  const footnote: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^Usage:$/.test(line)) { section = 'usage'; continue; }
    if (/^Options:$/.test(line)) { section = 'options'; continue; }
    if (line.trim() === '') continue;
    if (section === 'usage' && /^\s+zplc-cli\s/.test(line)) {
      const usage = line.trim();
      commands.push({ name: usage.split(/\s+/)[1]!, usage });
    } else if (section === 'usage' && !/^ZPLC CLI/.test(line)) footnote.push(line.trim());
    else if (section === 'options') {
      const option = /^\s+((?:-\w, )?--[\w-]+(?: <[^>]+>| [a-z]+)?|-\w, --[\w-]+)\s+(\S.*)$/.exec(line);
      if (option) options.push({ flags: option[1]!, description: option[2]! });
    }
  }
  const accepted = /\[((?:'[a-z-]+',?\s*)+)\]\.includes\(command\)/.exec(text);
  const names = accepted ? [...accepted[1]!.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]!) : [];
  const listed = [...new Set(commands.map((command) => command.name))];
  if (names.length === 0 || names.slice().sort().join() !== listed.slice().sort().join()) {
    throw new Error(`cli/index.ts: the commands of the usage text (${listed.join(', ')}) are not the commands main accepts (${names.join(', ')})`);
  }
  const reasons = new Map<number, string[]>();
  for (const match of text.matchAll(/code === '(\w+)' \? (\d+) : code === '(\w+)' \? (\d+) : 1/g)) {
    const [, cancelled, cancelledCode, timeout, timeoutCode] = match;
    for (const [reason, code, meaning] of [[cancelled!, cancelledCode!, 'cancelled'], [timeout!, timeoutCode!, 'timed out']] as const) {
      reasons.set(Number(code), [...(reasons.get(Number(code)) ?? []), `${meaning}: ${reason}`]);
    }
  }
  const exitCodes: Cli['exitCodes'] = [{ code: 0, meaning: 'success' }, { code: 1, meaning: 'the command failed, or its arguments were invalid' }];
  for (const [code, list] of reasons) {
    const meaning = list[0]!.split(': ')[0]!;
    exitCodes.push({ code, meaning: `${meaning} (${list.map((entry) => entry.split(': ')[1]).join(', ')})` });
  }
  return { commands, options, exitCodes: exitCodes.sort((a, b) => a.code - b.code), footnote: footnote.join(' ') };
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

export interface McpTool { name: string; title: string; description: string; inputs: string[]; readOnly: boolean }
export interface McpResource { uri: string; template: boolean }
export interface Mcp { tools: McpTool[]; resources: McpResource[] }

export function parseMcp(text: string): Mcp {
  const inputs = new Map<string, string[]>();
  for (const match of text.matchAll(/^const (\w+_INPUT) = z\.object\(\{([\s\S]*?)\}\)\.strict\(\);/gm)) {
    inputs.set(match[1]!, [...match[2]!.matchAll(/(\w+):\s*z\./g)].map((field) => field[1]!));
  }
  const annotations = new Map<string, boolean>();
  for (const match of text.matchAll(/^const (\w+) = \{ readOnlyHint: (true|false)/gm)) annotations.set(match[1]!, match[2] === 'true');
  const tools: McpTool[] = [...text.matchAll(/registerTool\('(\w+)', \{ title: '([^']*)', description: '([^']*)', inputSchema: (\w+), annotations: (\w+) \}/g)].map((match) => {
    const fields = inputs.get(match[4]!);
    const readOnly = annotations.get(match[5]!);
    if (fields === undefined || readOnly === undefined) throw new Error(`mcp/server.ts: the tool ${match[1]} uses ${match[4]} or ${match[5]}, which the reader does not know`);
    return { name: match[1]!, title: match[2]!, description: match[3]!, inputs: fields, readOnly };
  });
  const declared = /export const MCP_TOOL_NAMES = \[([^\]]*)\]/.exec(text);
  const declaredNames = declared ? [...declared[1]!.matchAll(/'(\w+)'/g)].map((match) => match[1]!) : [];
  if (declaredNames.join() !== tools.map((tool) => tool.name).join()) throw new Error(`mcp/server.ts: MCP_TOOL_NAMES (${declaredNames.join(', ')}) and the registered tools (${tools.map((tool) => tool.name).join(', ')}) differ`);
  const uris = /export const MCP_RESOURCE_URIS = \[([^\]]*)\]/.exec(text);
  const uriList = uris ? [...uris[1]!.matchAll(/'(zplc:\/\/[^']+)'/g)].map((match) => match[1]!) : [];
  const templates = [...text.matchAll(/template\('[\w-]+', '(zplc:\/\/[^']+)'/g)].map((match) => match[1]!);
  const fixed = [...text.matchAll(/^\s*resource\('(zplc:\/\/[^']+)'/gm)].map((match) => match[1]!);
  for (const topic of text.matchAll(/for \(const topic of \[([^\]]*)\] as const\) resource\(`(zplc:\/\/[a-z]+)\/\$\{topic\}`/g)) {
    for (const name of topic[1]!.matchAll(/'(\w+)'/g)) fixed.push(`${topic[2]}/${name[1]}`);
  }
  if (uriList.slice().sort().join() !== fixed.slice().sort().join()) throw new Error(`mcp/server.ts: MCP_RESOURCE_URIS and the registered resources differ (${uriList.join(', ')} against ${fixed.join(', ')})`);
  return { tools, resources: [...uriList.map((uri) => ({ uri, template: false })), ...templates.map((uri) => ({ uri, template: true }))] };
}

// ---------------------------------------------------------------------------
// Scenario files
// ---------------------------------------------------------------------------

export interface ScenarioFormat {
  fields: string[];
  optionalFields: string[];
  eventFields: string[];
  kinds: Array<{ kind: string; fields: string[] }>;
  plants: string[];
  limits: Array<{ name: string; value: string }>;
}

export function parseScenarioFormat(engine: string, workspace: string): ScenarioFormat {
  const top = /exact\(\s*source,\s*hasPlant\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\],\s*'scenario',?\s*\)/.exec(engine);
  if (!top) throw new Error('test-engine/index.ts: the top-level keys of a scenario were not found');
  const list = (text: string) => [...text.matchAll(/'(\w+)'/g)].map((match) => match[1]!);
  const withPlant = list(top[1]!);
  const without = list(top[2]!);
  const event = /exact\(\s*event,\s*\[([^\]]*)\]/.exec(engine);
  if (!event) throw new Error('test-engine/index.ts: the keys of an event were not found');
  const kindsType = /export type ScenarioKind = ([^;]*);/.exec(engine);
  if (!kindsType) throw new Error('test-engine/index.ts: ScenarioKind was not found');
  const keysOf = /const keys =\s*(kind === 'AT'[\s\S]*?:\s*\['kind', 'condition'\]);/.exec(engine);
  if (!keysOf) throw new Error('test-engine/index.ts: the keys of each kind were not found');
  const kinds = list(kindsType[1]!).map((kind) => {
    // the branch of the conditional that names the kind
    const branch = [...keysOf[1]!.matchAll(/(?:kind === '(\w+)'(?: \|\| kind === '(\w+)')*[^?]*\?\s*\[([^\]]*)\])/g)];
    const found = branch.find((candidate) => candidate[0]!.includes(`'${kind}'`));
    return { kind, fields: found ? list(found[3]!) : ['kind', 'condition'] };
  });
  const limits: ScenarioFormat['limits'] = [];
  for (const name of ['MAX_EVENTS', 'MAX_EXPECTATIONS', 'MAX_SIGNALS', 'MAX_SAMPLES', 'MAX_TRACE_VALUES']) {
    const match = new RegExp(`const ${name} = ([\\d_]+);`).exec(engine);
    if (!match) throw new Error(`test-engine/index.ts: ${name} was not found`);
    limits.push({ name, value: match[1]!.replace(/_/g, '') });
  }
  const tick = /integer\(source\.tickMs, 'tickMs', ([\d_]+)\)/.exec(engine);
  const duration = /integer\(source\.durationMs, 'durationMs', ([\d_]+)\)/.exec(engine);
  const idLength = /source\.id\.length > (\d+)/.exec(engine);
  if (!tick || !duration || !idLength) throw new Error('test-engine/index.ts: the range of tickMs, durationMs or id was not found');
  limits.push({ name: 'tickMs', value: tick[1]!.replace(/_/g, '') }, { name: 'durationMs', value: duration[1]!.replace(/_/g, '') }, { name: 'id length', value: idLength[1]! });
  for (const name of ['SCENARIO_MAX_BYTES', 'SCENARIOS_MAX_COUNT', 'SCENARIOS_MAX_BYTES']) {
    const match = new RegExp(`const ${name} = ([\\d* ]+);`).exec(workspace);
    if (!match) throw new Error(`cli/workspace.ts: ${name} was not found`);
    limits.push({ name, value: String(match[1]!.split('*').reduce((product, part) => product * Number(part.trim()), 1)) });
  }
  const plants = [...engine.matchAll(/source\.plant === '([\w-]+)'/g)].map((match) => match[1]!);
  return {
    fields: without,
    optionalFields: withPlant.filter((field) => !without.includes(field)),
    eventFields: list(event[1]!),
    kinds,
    plants,
    limits,
  };
}

// ---------------------------------------------------------------------------
// The runtime session protocol
// ---------------------------------------------------------------------------

export interface ProtocolMethod { method: string; params: string[] }
export interface Protocol { version: string; methods: ProtocolMethod[] }

export function parseProtocol(text: string): Protocol {
  const version = /#define ZPLC_NATIVE_PROTOCOL_VERSION "([^"]+)"/.exec(text)?.[1];
  if (!version) throw new Error('native_runtime_session.c: ZPLC_NATIVE_PROTOCOL_VERSION was not found');
  const methods = [...new Set([...text.matchAll(/strcmp\(\s*(?:\w+->)?method\s*,\s*"([a-z_.]+)"\s*\)/g)].map((match) => match[1]!))];
  const body = (name: string): string => {
    const start = text.indexOf(`static int ${name}(`);
    if (start < 0) throw new Error(`native_runtime_session.c: ${name} was not found`);
    const next = text.indexOf('\nstatic ', start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  };
  const keys = (source: string) => [...new Set([...source.matchAll(/strcmp\(\s*key\s*,\s*"(\w+)"\s*\)/g)].map((match) => match[1]!))];
  const empty = body('is_empty_params_method');
  const emptyMethods = new Set([...empty.matchAll(/"([a-z_.]+)"/g)].map((match) => match[1]!));
  const control = body('parse_canonical_control_params');
  const chain = control.slice(0, control.indexOf('skip_json_space'));
  const requiredBy = new Map<string, number>();
  for (const part of chain.split(/else if \(|if \(/).slice(1)) {
    const mask = /required = 0x([0-9A-Fa-f]+)U/.exec(part);
    if (!mask) continue;
    for (const method of part.matchAll(/"([a-z_.]+)"/g)) requiredBy.set(method[1]!, Number.parseInt(mask[1]!, 16));
  }
  const keyBits = new Map<number, string[]>();
  const loop = control.slice(control.indexOf('for (;;)'));
  for (const part of loop.split(/else if \(|if \(/).slice(1)) {
    const mask = /required & 0x([0-9A-Fa-f]+)U/.exec(part);
    if (!mask) continue;
    const found = [...part.matchAll(/strcmp\(\s*key\s*,\s*"(\w+)"\s*\)/g)].map((match) => match[1]!);
    if (found.length > 0) keyBits.set(Number.parseInt(mask[1]!, 16), found);
  }
  const special: Record<string, string[]> = {
    'session.hello': keys(body('parse_hello_params')),
    'simulation.input.set': keys(body('parse_simulation_input_params')),
    'scenario.step': keys(body('parse_scenario_step_params')),
  };
  const result = methods.map((method): ProtocolMethod => {
    if (special[method]) return { method, params: special[method]!.filter((key) => key !== 'key') };
    if (emptyMethods.has(method)) return { method, params: [] };
    const required = requiredBy.get(method);
    if (required === undefined) throw new Error(`native_runtime_session.c: the parameters of ${method} were not understood`);
    const params: string[] = [];
    for (const [bit, names] of [...keyBits].sort((a, b) => a[0] - b[0])) {
      if ((required & bit) === 0) continue;
      // program.load takes bytecode_hex, the other methods bytes_hex
      params.push(...names.filter((name) => !(method === 'program.load' ? name === 'bytes_hex' : name === 'bytecode_hex')));
    }
    return { method, params };
  });
  return { version, methods: result };
}
