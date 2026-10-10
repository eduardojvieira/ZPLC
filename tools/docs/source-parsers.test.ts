import { describe, expect, it } from 'bun:test';

import { parseCli, parseKconfig, parseMcp, parseProtocol, parseScenarioFormat, parseShellCommands } from './source-parsers';

describe('source readers: Kconfig (DOC-008)', () => {
  const KCONFIG = [
    'menuconfig ZPLC', '    bool "ZPLC PLC Runtime"', '    help', '      Enable the runtime.', '',
    'if ZPLC', '',
    'config ZPLC_DEPTH', '    int "Depth"', '    default 256', '    range 1 1000', '    help', '      How deep.', '      On two lines.', '',
    '      Second paragraph.', '',
    '# ---------', 'config ZPLC_WDT', '    bool "Watchdog"', '    depends on WATCHDOG', '    default n', 'endif # ZPLC',
  ].join('\n');

  it('reads the type, default, range, help and the symbols that a symbol depends on', () => {
    const [root, depth, watchdog] = parseKconfig(KCONFIG);
    expect(root).toMatchObject({ name: 'ZPLC', type: 'bool', prompt: 'ZPLC PLC Runtime', depends: [], help: 'Enable the runtime.\n' });
    expect(depth).toMatchObject({ name: 'ZPLC_DEPTH', type: 'int', defaults: ['256'], range: ['1', '1000'], depends: ['ZPLC'] });
    expect(depth!.help.startsWith('How deep. On two lines.')).toBe(true);
    expect(watchdog).toMatchObject({ name: 'ZPLC_WDT', depends: ['ZPLC', 'WATCHDOG'], defaults: ['n'] });
  });
});

describe('source readers: the shell command tree (DOC-008)', () => {
  const SHELL = [
    'SHELL_STATIC_SUBCMD_SET_CREATE(',
    '    sub_bp,',
    '    SHELL_CMD_ARG(add, NULL, "Add breakpoint: dbg bp add <pc>", cmd_add, 2, 0),',
    '    SHELL_SUBCMD_SET_END);',
    '',
    'SHELL_STATIC_SUBCMD_SET_CREATE(',
    '    sub_zplc,',
    '    SHELL_CMD(start, NULL, "Start execution", cmd_start),',
    '#ifdef CONFIG_ZPLC_SCHEDULER',
    '    SHELL_CMD(bp, &sub_bp, "Breakpoints", NULL),',
    '#endif',
    '    SHELL_SUBCMD_SET_END);',
    'SHELL_CMD_REGISTER(zplc, &sub_zplc, "ZPLC runtime commands", NULL);',
  ].join('\n');

  it('resolves the subcommand sets into command paths, with arguments and the symbol that guards them', () => {
    const commands = parseShellCommands(SHELL);
    expect(commands.map((command) => command.path.join(' '))).toEqual(['zplc', 'zplc start', 'zplc bp', 'zplc bp add']);
    expect(commands[3]).toMatchObject({ group: false, required: 1, optional: 0, when: ['ZPLC_SCHEDULER'], help: 'Add breakpoint: dbg bp add <pc>' });
    expect(commands[2]).toMatchObject({ group: true });
  });

  it('refuses a source whose subcommand set is never defined', () => {
    const broken = SHELL.replace('sub_bp,', 'sub_other,');
    expect(() => parseShellCommands(broken)).toThrow(/sub_bp/);
  });
});

describe('source readers: the command line, MCP and the protocol (DOC-008)', () => {
  it('reads the commands of the usage text and checks them against the commands that main accepts', () => {
    const source = [
      'function printHelp(output: Output): void {',
      '  output.log(`ZPLC CLI\\n\\nUsage:\\n  zplc-cli inspect <workspace> --json\\n  zplc-cli test <workspace> [--json]\\n\\nOptions:\\n  -h, --help        Show this help\\n  -l, --language <l> Source language`);',
      '}',
      "if (![\\'inspect\\', \\'test\\'].includes(command)) {}",
    ].join('\n').replace(/\\'/g, "'");
    const cli = parseCli(source);
    expect(cli.commands.map((command) => command.name)).toEqual(['inspect', 'test']);
    expect(cli.options).toEqual([{ flags: '-h, --help', description: 'Show this help' }, { flags: '-l, --language <l>', description: 'Source language' }]);
    expect(() => parseCli(source.replace("'test']", "'test', 'extra']"))).toThrow(/not the commands main accepts/);
  });

  it('reads the tools and resources of the MCP server and refuses a list that differs from the registrations', () => {
    const source = [
      "const SCENARIO_INPUT = z.object({ scenarioId: z.string().max(128) }).strict();",
      "const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;",
      "export const MCP_TOOL_NAMES = ['scenario_run'] as const;",
      "export const MCP_RESOURCE_URIS = ['zplc://project/manifest'] as const;",
      "  server.registerTool('scenario_run', { title: 'Run one scenario', description: 'Run one.', inputSchema: SCENARIO_INPUT, annotations: READ_ONLY }, () => 1);",
      "  resource('zplc://project/manifest', async () => ({}));",
    ].join('\n');
    expect(parseMcp(source).tools).toEqual([{ name: 'scenario_run', title: 'Run one scenario', description: 'Run one.', inputs: ['scenarioId'], readOnly: true }]);
    expect(() => parseMcp(source.replace("['scenario_run']", "['scenario_run', 'other']"))).toThrow(/differ/);
  });

  it('reads the methods of the session protocol and the parameters of each', () => {
    const source = [
      '#define ZPLC_NATIVE_PROTOCOL_VERSION "1.0"',
      'static int is_empty_params_method(const char *method)',
      '{',
      '    return strcmp(method, "status.get") == 0;',
      '}',
      'static int parse_hello_params(const char **cursor)',
      '{',
      '    if (strcmp(key, "client_name") == 0) return 1;',
      '}',
      'static int parse_simulation_input_params(const char **cursor) { return strcmp(key, "input_id"); }',
      'static int parse_scenario_step_params(const char **cursor) { return strcmp(key, "at_ms"); }',
      'static int parse_canonical_control_params(const char **cursor, const char *method)',
      '{',
      '    if (strcmp(method, "memory.read") == 0) {',
      '        required = 0x03U;',
      '    } else {',
      '        return -1;',
      '    }',
      '    skip_json_space(cursor);',
      '    for (;;) {',
      '        if (strcmp(key, "address") == 0 && (required & 0x01U) != 0U) {',
      '        } else if (strcmp(key, "length") == 0 && (required & 0x02U) != 0U) {',
      '        }',
      '    }',
      '}',
      'static void dispatch(void) { if (strcmp(request->method, "session.hello") == 0) {} if (strcmp(request->method, "memory.read") == 0) {} if (strcmp(request->method, "status.get") == 0) {} }',
    ].join('\n');
    expect(parseProtocol(source)).toEqual({
      version: '1.0',
      methods: [
        { method: 'status.get', params: [] },
        { method: 'memory.read', params: ['address', 'length'] },
        { method: 'session.hello', params: ['client_name'] },
      ],
    });
  });

  it('reads the fields, kinds and limits of a scenario file', () => {
    const engine = [
      'const MAX_EVENTS = 256;', 'const MAX_EXPECTATIONS = 128;', 'const MAX_SIGNALS = 64;', 'const MAX_SAMPLES = 10_000;', 'const MAX_TRACE_VALUES = 1_000_000;',
      "export type ScenarioKind = 'AT' | 'ALWAYS';",
      "exact(source, hasPlant ? ['schemaVersion', 'id', 'plant', 'tickMs'] : ['schemaVersion', 'id', 'tickMs'], 'scenario');",
      "source.id.length > 128",
      "const tickMs = integer(source.tickMs, 'tickMs', 60_000);",
      "const durationMs = integer(source.durationMs, 'durationMs', 3_600_000);",
      "if (source.plant === 'motor-v1') {}",
      "exact(event, ['atMs', 'set'], 'event');",
      "const keys = kind === 'AT' ? ['kind', 'atMs', 'condition']",
      "  : ['kind', 'condition'];",
    ].join('\n');
    const workspace = 'const SCENARIO_MAX_BYTES = 128 * 1024;\nconst SCENARIOS_MAX_COUNT = 64;\nconst SCENARIOS_MAX_BYTES = 512 * 1024;';
    const format = parseScenarioFormat(engine, workspace);
    expect(format.fields).toEqual(['schemaVersion', 'id', 'tickMs']);
    expect(format.optionalFields).toEqual(['plant']);
    expect(format.kinds).toEqual([{ kind: 'AT', fields: ['kind', 'atMs', 'condition'] }, { kind: 'ALWAYS', fields: ['kind', 'condition'] }]);
    expect(format.limits.find((limit) => limit.name === 'SCENARIO_MAX_BYTES')?.value).toBe('131072');
  });
});
