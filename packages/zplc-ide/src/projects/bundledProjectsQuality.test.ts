import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNativeScenarioSession } from '../cli/nativeScenarioRuntime';
import { itNative, nativeRuntimeBinary } from '../cli/nativeRuntimeGuard';
import { compilerCompile } from '../cli/toolApi';
import { compileScenario, runScenario } from '../test-engine';

// What the bundled examples may claim. bundledProjects.test.ts proves that each one validates, builds and passes its
// scenarios; this file checks that what they SAY is true: no credentials, no network switched on in a blink demo, every
// pin and ADC address read from the board overlay or HAL it names, comments that explain the program, no persistence claim
// without retained data, and a scenario for every example the test engine can run.
const projectsRoot = fileURLToPath(new URL('../../projects', import.meta.url));
const boardsRoot = fileURLToPath(new URL('../../../../firmware/app/boards', import.meta.url));
const allProjects = readdirSync(projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const exampleProjects = allProjects.filter((name) => !name.endsWith('_starter'));
const rootOf = (name: string): string => join(projectsRoot, name);

type IoPoint = { name: string; address: string; pin?: number; description?: string; channel?: number };
type Manifest = {
  name: string;
  description?: string;
  target?: { board?: string };
  tasks: Array<{ interval_ms?: number; programs: string[] }>;
  io?: { inputs?: IoPoint[]; outputs?: IoPoint[]; analog?: { adc?: IoPoint[]; dac?: IoPoint[] } };
  network?: unknown;
  communication?: unknown;
};
const manifestOf = (name: string): Manifest => JSON.parse(readFileSync(join(rootOf(name), 'zplc.json'), 'utf8')) as Manifest;
const sourcesOf = (name: string): Array<{ file: string; text: string }> =>
  readdirSync(join(rootOf(name), 'src')).map((file) => ({ file, text: readFileSync(join(rootOf(name), 'src', file), 'utf8') }));
const stSourcesOf = (name: string) => sourcesOf(name).filter(({ file }) => file.endsWith('.st'));
const stripComments = (text: string): string => text.replace(/\(\*[\s\S]*?\*\)/g, '');
const commentsOf = (text: string): string => [...text.matchAll(/\(\*([\s\S]*?)\*\)/g)].map((match) => match[1]).join('\n');
const scenarioCount = (name: string): number =>
  existsSync(join(rootOf(name), 'tests')) ? readdirSync(join(rootOf(name), 'tests')).filter((file) => file.endsWith('.scenario.json')).length : 0;

// Hardware demos: everything that targets a board the firmware has an overlay for.
const hardwareDemos = exampleProjects.filter((name) => /^(pico_|esp32)/.test(name) || name === 'multitask_demo' || name === 'analog_test');

describe('no credentials in any bundled manifest', () => {
  const CREDENTIAL_KEY = /ssid|passw|psk|secret|token|sas|key|credential|username/i;
  const credentialPaths = (value: unknown, at = '$'): string[] => {
    if (Array.isArray(value)) return value.flatMap((item, index) => credentialPaths(item, `${at}[${index}]`));
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) =>
      typeof child === 'string' && child.trim() !== '' && CREDENTIAL_KEY.test(key) ? [`${at}.${key}`] : credentialPaths(child, `${at}.${key}`));
  };
  const enabledPaths = (value: unknown, at = '$'): string[] => {
    if (Array.isArray(value)) return value.flatMap((item, index) => enabledPaths(item, `${at}[${index}]`));
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) => (key === 'enabled' && child === true ? [`${at}.enabled`] : enabledPaths(child, `${at}.${key}`)));
  };

  for (const name of allProjects) {
    it(`${name} has no non-empty SSID, password, key or other credential-looking value`, () => {
      expect(credentialPaths(manifestOf(name))).toEqual([]);
    });
    it(`${name} switches no network or communication block on`, () => {
      const { network, communication } = manifestOf(name);
      expect([...enabledPaths(network, 'network'), ...enabledPaths(communication, 'communication')]).toEqual([]);
    });
  }

  // A blink demo has nothing to say to a network: no network block and no communication block, not even a disabled one.
  for (const name of hardwareDemos) {
    it(`${name} carries no network block and no communication block`, () => {
      const manifest = manifestOf(name);
      expect(manifest.network).toBeUndefined();
      expect(manifest.communication).toBeUndefined();
    });
  }
});

describe('every example the test engine can run has a scenario', () => {
  // Single-task examples need at least one scenario, unless they are listed here with the reason. The list may only shrink.
  const NO_SCENARIO: Record<string, string> = {};
  for (const name of exampleProjects.filter((example) => manifestOf(example).tasks.length === 1)) {
    it(`${name} has a scenario`, () => {
      if (name in NO_SCENARIO) expect(scenarioCount(name), `${name} is listed in NO_SCENARIO but has a scenario: delete the entry`).toBe(0);
      else expect(scenarioCount(name)).toBeGreaterThan(0);
    });
  }

  // The test engine refuses a project with more than one task (SIMULATION_UNSUPPORTED_PROJECT), so a multi-task example has
  // no scenario and its manifest has to say why.
  // kitchen_sink is a ten-task conformance fixture owned by the work that made it build; its manifest is not edited here.
  const MULTI_TASK_EXEMPT = new Set(['kitchen_sink']);
  for (const name of exampleProjects.filter((example) => manifestOf(example).tasks.length > 1 && !MULTI_TASK_EXEMPT.has(example))) {
    it(`${name} is multi-task, has no scenario and says so`, () => {
      expect(scenarioCount(name)).toBe(0);
      expect(manifestOf(name).description).toMatch(/no scenario/i);
      expect(manifestOf(name).description).toMatch(/one task/i);
    });
  }
});

describe('hardware demos read their pins from the board overlay', () => {
  const OVERLAY_OF_BOARD: Record<string, string> = { rpi_pico: 'rpi_pico_rp2040.overlay', esp32s3_devkitc: 'esp32s3_devkitc_esp32s3_procpu.overlay' };
  // GPIO number of "<&gpioN pin ...": the ESP32-S3 has two banks (gpio1 starts at GPIO32); the RP2040 has one.
  const overlayPins = (file: string): { outputs: Map<number, number>; inputs: Map<number, number> } => {
    const text = readFileSync(join(boardsRoot, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const pins = (node: string) => new Map([...text.matchAll(new RegExp(`${node}_(\\d+)\\s*\\{[^}]*?gpios\\s*=\\s*<&gpio(\\d)\\s+(\\d+)`, 'g'))]
      .map((match): [number, number] => [Number(match[1]), Number(match[2]) * 32 + Number(match[3])]));
    return { outputs: pins('led'), inputs: pins('button') };
  };

  it('the overlay parser finds the pins it is checked against', () => {
    expect([...overlayPins('rpi_pico_rp2040.overlay').outputs]).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect([...overlayPins('rpi_pico_rp2040.overlay').inputs]).toEqual([[0, 15]]);
    expect([...overlayPins('esp32s3_devkitc_esp32s3_procpu.overlay').outputs]).toEqual([[0, 38], [1, 15]]);
  });

  for (const name of hardwareDemos) {
    const board = manifestOf(name).target?.board ?? '';
    it(`${name} targets ${board}, a board with an overlay, and its pins and pin sentences match it`, () => {
      expect(OVERLAY_OF_BOARD, `${name}: no overlay known for board ${board}`).toHaveProperty(board);
      expect(existsSync(join(boardsRoot, OVERLAY_OF_BOARD[board]!))).toBe(true);
      if (/^pico_/.test(name) || name === 'multitask_demo' || name === 'analog_test') expect(board).toBe('rpi_pico');
      if (/^esp32s3_/.test(name)) expect(board).toBe('esp32s3_devkitc');

      const { outputs, inputs } = overlayPins(OVERLAY_OF_BOARD[board]!);
      const manifest = manifestOf(name);
      for (const [points, table] of [[manifest.io?.outputs ?? [], outputs], [manifest.io?.inputs ?? [], inputs]] as const) {
        for (const point of points) {
          const index = Number(/^%[IQ]X?0\.(\d+)$/.exec(point.address)?.[1]);
          expect(table.has(index), `${name}: ${point.address} (${point.name}) has no pin in the ${board} overlay`).toBe(true);
          expect(point.pin, `${name}: ${point.name} ${point.address}`).toBe(table.get(index));
        }
      }
      // Any "GPIO nn" or "GPnn" in the text has to be a pin the overlay gives to some channel (or an RP2040 ADC pin), unless the
      // sentence says that pin is NOT driven ("the overlay does not drive the built-in LED on GP25").
      const allowed = new Set<number>([...outputs.values(), ...inputs.values(), ...(board === 'rpi_pico' ? [26, 27, 28, 29] : [])]);
      const prose = [manifest.description ?? '', ...(manifest.io?.outputs ?? []).map((p) => p.description ?? ''), ...(manifest.io?.inputs ?? []).map((p) => p.description ?? ''),
        ...stSourcesOf(name).map(({ text }) => commentsOf(text))].join('\n');
      const mentioned = prose.split(/\.\s|\n/).filter((sentence) => !/\bnot\b|n't/i.test(sentence))
        .flatMap((sentence) => [...sentence.matchAll(/\bGPIO ?(\d+)\b|\bGP(\d+)\b/g)].map((match) => Number(match[1] ?? match[2])));
      expect(mentioned.filter((pin) => !allowed.has(pin)), `${name} mentions a pin its overlay does not use`).toEqual([]);
    });
  }

  it('esp32s3_blinky words its pin as the current overlay and says the DevKitC-1 mapping is pending', () => {
    const manifest = manifestOf('esp32s3_blinky');
    const text = [manifest.description, ...(manifest.io?.outputs ?? []).map((point) => point.description)].join(' ');
    expect(text).toMatch(/current[^.]*overlay/i);
    expect(text).toMatch(/DevKitC-1[^.]*pending/i);
  });

  // The HAL stores ADC channel n at input-image byte 8 + 2n, which is word %IW(4 + n); the manifest and the source must agree.
  it('analog inputs sit at %IW(4 + channel) and every %IW a source reads is declared', () => {
    for (const name of exampleProjects) {
      const adc = manifestOf(name).io?.analog?.adc ?? [];
      for (const point of adc) expect(point.address, `${name}: ${point.name}`).toBe(`%IW${4 + (point.channel ?? -1)}`);
      const used = new Set(stSourcesOf(name).flatMap(({ text }) => [...stripComments(text).matchAll(/AT\s+(%IW\d+)/g)].map((match) => match[1]!)));
      if (used.size > 0) expect([...used].sort(), `${name}: %IW addresses the source reads`).toEqual(adc.map((point) => point.address).sort());
    }
  });

  it('a manifest with no DAC does not say DAC', () => {
    for (const name of exampleProjects) {
      const manifest = manifestOf(name);
      if ((manifest.io?.analog?.dac ?? []).length === 0) expect(manifest.description ?? '', name).not.toMatch(/(?<!\bno )\bDAC\b/i);
    }
  });

  it('every I/O point a demo declares is used by its sources', () => {
    for (const name of hardwareDemos) {
      const code = stSourcesOf(name).map(({ text }) => stripComments(text)).join('\n');
      const manifest = manifestOf(name);
      const declared = [...(manifest.io?.inputs ?? []), ...(manifest.io?.outputs ?? []), ...(manifest.io?.analog?.adc ?? [])];
      expect(declared.filter((point) => !new RegExp(`\\b${point.name}\\b`).test(code)).map((point) => point.name), `${name}: declared but unused`).toEqual([]);
    }
  });
});

describe('what the examples say about timing, persistence and function blocks is true', () => {
  const retainExists = exampleProjects.some((name) => stSourcesOf(name).some(({ text }) => /\bRETAIN\b/.test(stripComments(text))));

  it('no manifest claims to test persistence unless an example with RETAIN exists', () => {
    const CLAIM = /(?<!\b(?:not|never|cannot|n't) )\b(tests?|verif(?:y|ies)|demonstrates?|proves?)\s+(?:NVS\s+)?(?:persist\w*|retentive|retention)/i;
    for (const name of allProjects) if (!retainExists) expect(manifestOf(name).description ?? '', name).not.toMatch(CLAIM);
  });

  it('no source claims a power cycle keeps data when nothing is retained', () => {
    for (const name of exampleProjects) for (const { file, text } of stSourcesOf(name)) {
      if (!retainExists) expect(commentsOf(text), `${name}/${file}`).not.toMatch(/should continue blinking|to verify persistence/i);
    }
  });

  it('no example keeps a leftover "TEMPORARY TEST VALUE" comment', () => {
    for (const name of allProjects) for (const { file, text } of sourcesOf(name)) expect(text, `${name}/${file}`).not.toMatch(/TEMPORARY TEST/i);
  });

  // BLINK is not in IEC 61131-3. No example may recommend it as the standard way; a teaching example that uses it has to say it is
  // an extension (kitchen_sink is a list-of-blocks conformance fixture, not a teaching example).
  it('a source that uses BLINK never recommends it as IEC, and says it is a ZPLC extension', () => {
    for (const name of exampleProjects) for (const { file, text } of stSourcesOf(name)) {
      if (!/:\s*BLINK\s*;/.test(stripComments(text))) continue;
      expect(commentsOf(text), `${name}/${file}`).not.toMatch(/recommended way/i);
      if (name !== 'kitchen_sink') expect(commentsOf(text), `${name}/${file}`).toMatch(/ZPLC extension/);
    }
  });

  it('pico_blinky_ton builds a TON and pico_blinky_blink builds the BLINK function block', () => {
    const built = (name: string) => stSourcesOf(name).map(({ text }) => stripComments(text)).join('\n');
    expect(built('pico_blinky_ton')).toMatch(/:\s*TON\s*;/);
    expect(built('pico_blinky_ton')).not.toMatch(/\bBLINK\b/);
    expect(built('pico_blinky_blink')).toMatch(/:\s*BLINK\s*;/);
    expect(manifestOf('pico_blinky_blink').description).toMatch(/not part of IEC 61131-3/);
  });

  it('a counted blink says what it counts: task interval times scans is the time its comments claim', () => {
    for (const name of ['pico_blinky', 'esp32s3_blinky']) {
      const text = stSourcesOf(name).map((source) => source.text).join('\n');
      const scans = Number(/Counter >= (\d+)/.exec(stripComments(text))?.[1]);
      expect((manifestOf(name).tasks[0]!.interval_ms ?? 0) * scans, name).toBe(500);
      expect(text, name).not.toMatch(/\b481\b/);
    }
  });

  // The VAR_OUTPUT block of each program names the LED it drives (the old FastBlink called its LED1 "LED2").
  it('multitask_demo comments name the LED each program drives', () => {
    const outputs = (file: string): string => /VAR_OUTPUT([\s\S]*?)END_VAR/.exec(sourcesOf('multitask_demo').find((source) => source.file === file)!.text)![1]!;
    expect(outputs('FastBlink.st')).toMatch(/LED1/);
    expect(outputs('FastBlink.st')).not.toMatch(/LED2/);
    expect(outputs('SlowBlink.st')).toMatch(/LED2/);
    expect(outputs('SlowBlink.st')).not.toMatch(/LED1/);
  });
});

describe('the reference examples explain themselves', () => {
  const EXPLAINED = ['motor_start_stop', 'scan_snapshot', 'tank_level', 'pedestrian_crossing', 'conveyor_01', 'edge_counter', 'motor_plant', ...hardwareDemos];
  for (const name of EXPLAINED) {
    it(`${name} has comments that say what it is for`, () => {
      expect(stSourcesOf(name).map(({ text }) => commentsOf(text)).join('\n').length).toBeGreaterThan(300);
    });
  }

  it('the stop inputs of the reference programs say they are active-high and how a real installation wires them', () => {
    for (const name of ['motor_start_stop', 'tank_level', 'conveyor_01']) {
      expect(commentsOf(stSourcesOf(name)[0]!.text), name).toMatch(/normally closed/i);
    }
  });
});

describe('visual sources', () => {
  it('motor_control is one textbook latch: no SET or RESET coil, one coil on the contactor, and StopPB is not called NC', () => {
    const ld = JSON.parse(readFileSync(join(rootOf('motor_control'), 'src', 'main.ld.json'), 'utf8')) as {
      variables: { inputs: Array<{ name: string; comment?: string }> };
      rungs: Array<{ grid: Array<Array<{ element: { type: string; variable: string } | null }>> }>;
    };
    const elements = ld.rungs.flatMap((rung) => rung.grid.flat()).flatMap((cell) => (cell.element ? [cell.element] : []));
    expect(elements.filter((element) => element.type === 'coil_set' || element.type === 'coil_reset')).toEqual([]);
    expect(elements.filter((element) => element.type === 'coil' && element.variable === 'MotorContactor')).toHaveLength(1);
    expect(ld.variables.inputs.find((input) => input.name === 'StopPB')?.comment).not.toMatch(/\(NC\)/);
  });

  it('a visual source has no $schema, or one that exists', () => {
    for (const name of allProjects) {
      for (const file of readdirSync(join(rootOf(name), 'src')).filter((candidate) => /\.(ld|fbd|sfc)\.json$/.test(candidate))) {
        const path = join(rootOf(name), 'src', file);
        const schema = (JSON.parse(readFileSync(path, 'utf8')) as { $schema?: string }).$schema;
        if (schema !== undefined) expect(existsSync(resolve(dirname(path), schema)), `${name}/${file} points at ${schema}`).toBe(true);
      }
    }
  });
});

describe('edge_counter counts edges with CTU alone', () => {
  it('feeds the pulse straight to CU, with no R_TRIG in front', () => {
    const code = stripComments(sourcesOf('edge_counter').find(({ file }) => file === 'EdgeCounter.st')!.text);
    expect(code).not.toMatch(/R_TRIG/);
    expect(code).toMatch(/CU\s*:=\s*PulseInput/);
  });

  // A pulse held for seven scans must count once, so CountReached stays FALSE until the third distinct pulse. This runs inline
  // on purpose: edge_counter is a golden project whose scenario list other tests pin.
  const HELD_PULSE = {
    schemaVersion: 1, id: 'EdgeCounterHeldPulse', tickMs: 10, durationMs: 140,
    events: [
      { atMs: 0, set: { 'EdgeCounter.PulseInput': false, 'EdgeCounter.Reset': false } },
      { atMs: 10, set: { 'EdgeCounter.PulseInput': true } }, { atMs: 80, set: { 'EdgeCounter.PulseInput': false } },
      { atMs: 90, set: { 'EdgeCounter.PulseInput': true } }, { atMs: 100, set: { 'EdgeCounter.PulseInput': false } },
      { atMs: 110, set: { 'EdgeCounter.PulseInput': true } }, { atMs: 120, set: { 'EdgeCounter.PulseInput': false } },
      { atMs: 130, set: { 'EdgeCounter.Reset': true } }, { atMs: 140, set: { 'EdgeCounter.Reset': false } },
    ],
    expectations: [
      { kind: 'FOR', fromMs: 10, forMs: 90, condition: { 'EdgeCounter.CountReached': false } },
      { kind: 'AT', atMs: 110, condition: { 'EdgeCounter.CountReached': true } },
      { kind: 'AT', atMs: 120, condition: { 'EdgeCounter.CountReached': true } },
      { kind: 'AT', atMs: 130, condition: { 'EdgeCounter.CountReached': false } },
    ],
  };
  itNative('counts a pulse held for seven scans once', async () => {
    const previous = process.env.ZPLC_NATIVE_SIM_BIN;
    process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
    try {
      const built = await compilerCompile(rootOf('edge_counter'));
      if (!built.ok || !built.debugMap) throw new Error(JSON.stringify(built.evidence.diagnostics));
      const session = await createNativeScenarioSession(process.env);
      try {
        const result = await runScenario(compileScenario(HELD_PULSE, built.debugMap), built.zplcFile!, session.runtime);
        expect(result.assertions.map((assertion) => assertion.passed)).toEqual([true, true, true, true]);
      } finally {
        await session.close();
      }
    } finally {
      if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
      else process.env.ZPLC_NATIVE_SIM_BIN = previous;
    }
  }, 30_000);
});

describe('motor_plant supervises the start', () => {
  // motor_plant is a golden project whose scenario list other tests pin, so these two run inline. The AtSpeed feedback is
  // written by the scenario itself (no plant), which is what lets one run withhold it.
  const withoutPlant = (id: string, durationMs: number, events: unknown[], expectations: unknown[]) =>
    ({ schemaVersion: 1, id, tickMs: 10, durationMs, events, expectations });
  const at = (atMs: number, condition: Record<string, boolean>) => ({ kind: 'AT', atMs, condition });
  const STALLED = withoutPlant('MotorStartFails', 1500, [
    { atMs: 0, set: { 'MotorPlant.Start': false, 'MotorPlant.Stop': false, 'MotorPlant.AtSpeed': false } },
    { atMs: 10, set: { 'MotorPlant.Start': true } }, { atMs: 20, set: { 'MotorPlant.Start': false } },
    { atMs: 1300, set: { 'MotorPlant.Stop': true } }, { atMs: 1310, set: { 'MotorPlant.Stop': false } },
  ], [
    at(500, { 'MotorPlant.Command': true, 'MotorPlant.Running': false, 'MotorPlant.Fault': false }),   // waiting for speed
    at(1200, { 'MotorPlant.Command': false, 'MotorPlant.Running': false, 'MotorPlant.Fault': true }),   // timed out: off and latched
    at(1290, { 'MotorPlant.Command': false, 'MotorPlant.Fault': true }),                                // stays latched
    at(1310, { 'MotorPlant.Command': false, 'MotorPlant.Fault': false }),                               // Stop clears the fault, does not restart
    at(1500, { 'MotorPlant.Command': false, 'MotorPlant.Fault': false }),
  ]);
  const HEALTHY = withoutPlant('MotorStartsInTime', 1500, [
    { atMs: 0, set: { 'MotorPlant.Start': false, 'MotorPlant.Stop': false, 'MotorPlant.AtSpeed': false } },
    { atMs: 10, set: { 'MotorPlant.Start': true } }, { atMs: 20, set: { 'MotorPlant.Start': false } },
    { atMs: 520, set: { 'MotorPlant.AtSpeed': true } },
  ], [
    at(500, { 'MotorPlant.Command': true, 'MotorPlant.Running': false, 'MotorPlant.Fault': false }),
    at(530, { 'MotorPlant.Command': true, 'MotorPlant.Running': true, 'MotorPlant.Fault': false }),
    at(1500, { 'MotorPlant.Command': true, 'MotorPlant.Running': true, 'MotorPlant.Fault': false }),     // no late trip
  ]);

  for (const [title, scenario] of [['drops the command and latches a fault when AtSpeed never arrives', STALLED], ['does not trip when AtSpeed arrives in time', HEALTHY]] as const) {
    itNative(title, async () => {
      const previous = process.env.ZPLC_NATIVE_SIM_BIN;
      process.env.ZPLC_NATIVE_SIM_BIN = nativeRuntimeBinary;
      try {
        const built = await compilerCompile(rootOf('motor_plant'));
        if (!built.ok || !built.debugMap) throw new Error(JSON.stringify(built.evidence.diagnostics));
        const session = await createNativeScenarioSession(process.env);
        try {
          const result = await runScenario(compileScenario(scenario, built.debugMap), built.zplcFile!, session.runtime);
          expect(result.assertions.every((assertion) => assertion.passed)).toBe(true);
        } finally {
          await session.close();
        }
      } finally {
        if (previous === undefined) delete process.env.ZPLC_NATIVE_SIM_BIN;
        else process.env.ZPLC_NATIVE_SIM_BIN = previous;
      }
    }, 30_000);
  }
});
