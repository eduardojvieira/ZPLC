/**
 * IDE-031: a scenario test with temporal assertions gives the same result from Studio, the CLI and the MCP tools.
 * The three share the Tool API, so the property worth proving is what each one makes of it: the verdict, the evidence
 * hashes of the compiled program and of the recorded trace, and the sampled values. Every bundled project is run
 * through all of them, and so is a project whose assertion fails.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect } from 'bun:test';

import { presentWorkspaceTestResult } from '../components/workspaceTestPresentation';
import { createMcpDispatcher, openMcpWorkspace } from '../mcp/server';
import { main } from './index';
import { itNative } from './nativeRuntimeGuard';
import { scenarioRun, testsRun, type TestRunResult } from './toolApi';

const PROJECTS = new URL('../../projects/', import.meta.url).pathname;
const bundled = readdirSync(PROJECTS)
  .filter((name) => readdirSync(join(PROJECTS, name)).includes('tests'))
  .sort();
const signal = () => new AbortController().signal;

/**
 * A project whose program talks to the Modbus server or the MQTT broker of its own simulation (COM-009). The runs of such
 * a project meet a real socket, so the bytes of a trace carry the timing of the traffic and two runs of the same project
 * do not hash alike: the verdict and the sampled values stay compared, the trace hashes are not.
 */
const talksToThePeers = (name: string) =>
  readdirSync(join(PROJECTS, name, 'src')).some((file) =>
    /\b(MQTT_|MB_)[A-Z_]+/.test(readFileSync(join(PROJECTS, name, 'src', file), 'utf8')),
  );
const withoutTraceHashes = <T extends { artifacts: Array<{ kind: string }>; scenarios: unknown }>(value: T): T =>
  ({
    ...value,
    artifacts: value.artifacts.map((artifact) => (artifact.kind === 'trace' ? { kind: 'trace' } : artifact)),
    scenarios: Array.isArray(value.scenarios)
      ? value.scenarios.map((scenario) =>
          Object.fromEntries(Object.entries(scenario as object).filter(([key]) => !['traceSha256', 'traceByteLength'].includes(key))),
        )
      : value.scenarios,
  }) as T;
const viewOf = (name: string) => (value: Parameters<typeof essence>[0]) =>
  talksToThePeers(name) ? withoutTraceHashes(essence(value)) : essence(value);

/** The result a person or an agent can compare: the verdict, the hashes and the per-scenario evidence, never timing or ids. */
function essence(value: {
  ok: boolean;
  summary?: { scenarios?: unknown[] };
  evidence: {
    outcome: string;
    diagnostics: Array<{ code: string; path?: string }>;
    artifacts: Array<{ kind: string; sha256: string; byteLength: number }>;
  };
}) {
  return {
    ok: value.ok,
    outcome: value.evidence.outcome,
    diagnostics: value.evidence.diagnostics.map((diagnostic) => `${diagnostic.code}@${diagnostic.path ?? ''}`),
    artifacts: value.evidence.artifacts.map(({ kind, sha256, byteLength }) => ({ kind, sha256, byteLength })),
    scenarios: value.summary?.scenarios ?? null,
  };
}

async function viaCli(args: string[]): Promise<{ code: number; json: Parameters<typeof essence>[0] & { preview?: unknown } }> {
  const lines: string[] = [];
  const code = await main([...args, '--json'], {
    log: (line: unknown) => {
      lines.push(String(line));
    },
    error: () => undefined,
  });
  return { code, json: JSON.parse(lines[0]!) };
}

async function viaMcp(root: string, tool: 'tests_run' | 'scenario_run', args: Record<string, unknown> = {}) {
  const workspace = await openMcpWorkspace(root);
  if (!workspace) throw new Error(`the workspace of ${root} does not open`);
  const result = await createMcpDispatcher(workspace)(tool, args, signal());
  return result.structuredContent as unknown as Parameters<typeof essence>[0];
}

describe('a project run through the Tool API, the CLI, the MCP tools and Studio gives one result (IDE-031)', () => {
  itNative('covers every kind of temporal assertion the scenario format has', () => {
    const kinds = new Set<string>();
    for (const name of bundled) {
      for (const file of readdirSync(join(PROJECTS, name, 'tests'))) {
        const scenario = JSON.parse(readFileSync(join(PROJECTS, name, 'tests', file), 'utf8')) as {
          expectations?: Array<{ kind: string }>;
        };
        for (const expectation of scenario.expectations ?? []) kinds.add(expectation.kind);
      }
    }
    expect([...kinds].sort()).toEqual(['ALWAYS', 'AT', 'EVENTUALLY', 'FALLING', 'FOR', 'NEVER', 'RISING', 'UNTIL', 'WITHIN']);
  });

  for (const name of bundled) {
    itNative(
      `${name}: tests`,
      async () => {
        const root = join(PROJECTS, name);
        const seen = viewOf(name);
        const direct = await testsRun(root);
        const cli = await viaCli(['test', root]);
        const mcp = await viaMcp(root, 'tests_run');
        expect(seen(cli.json)).toEqual(seen(direct));
        expect(seen(mcp)).toEqual(seen(direct));

        // Studio: what the main process hands the renderer is the Tool API value, and the renderer presents it.
        const studio = presentWorkspaceTestResult(direct);
        expect(studio.kind).toBe(direct.ok ? 'passed' : 'assertion-failed');
        expect(studio.artifacts.map(({ kind, sha256, byteLength }) => ({ kind, sha256, byteLength })) as unknown).toEqual(
          essence(direct).artifacts,
        );
        if (direct.ok) {
          expect(studio.scenarioCount).toBe(direct.summary.scenarios.length);
          // The values the renderer shows are the values the Tool API recorded, scenario by scenario.
          const shown = studio.preview?.scenarios ?? [];
          for (const scenario of shown) {
            const recorded = direct.preview.scenarios.find((candidate) => candidate.id === scenario.id)!;
            expect(scenario.passed).toBe(recorded.passed);
            expect(scenario.assertions).toEqual(recorded.assertions);
            expect(scenario.samples).toEqual(recorded.samples);
          }
          expect(shown.length).toBe(direct.preview.scenarios.length);
        }
        // The CLI prints the recorded values too: the same samples, the same assertions.
        // (a project that talks to the peers of its simulation completes a WITHIN at the moment its socket answers, so only the verdicts
        // are compared)
        const verdicts = (value: unknown) =>
          ((value as { scenarios?: Array<{ id: string; passed: boolean }> } | undefined)?.scenarios ?? []).map(({ id, passed }) => ({
            id,
            passed,
          }));
        if (talksToThePeers(name)) expect(verdicts(cli.json.preview)).toEqual(verdicts((direct as { preview?: unknown }).preview));
        else expect(cli.json.preview).toEqual((direct as { preview?: unknown }).preview);
        expect(cli.code).toBe(direct.ok ? 0 : 1);
      },
      120_000,
    );

    itNative(
      `${name}: the first scenario by itself`,
      async () => {
        const root = join(PROJECTS, name);
        const seen = viewOf(name);
        const all = await testsRun(root);
        if (!all.ok) return;
        const id = all.summary.scenarios[0]!.id;
        const direct = await scenarioRun(root, id);
        const cli = await viaCli(['scenario-run', root, id]);
        const mcp = await viaMcp(root, 'scenario_run', { scenarioId: id });
        expect(seen(cli.json)).toEqual(seen(direct));
        expect(seen(mcp)).toEqual(seen(direct));
        // One scenario by itself records the same trace as the same scenario in the whole run.
        expect(seen(direct).scenarios).toEqual((seen(all).scenarios as Array<{ id: string }>).filter((scenario) => scenario.id === id));
      },
      120_000,
    );
  }

  itNative(
    'a failing temporal assertion fails the same way from every entry point',
    async () => {
      const scratch = mkdtempSync(join(tmpdir(), 'zplc-parity-'));
      try {
        const root = join(scratch, 'motor');
        cpSync(join(PROJECTS, 'motor_start_stop'), root, { recursive: true });
        const file = join(root, 'tests', readdirSync(join(root, 'tests'))[0]!);
        const scenario = JSON.parse(readFileSync(file, 'utf8')) as {
          expectations: Array<{ kind: string; condition: Record<string, boolean> }>;
        };
        // Turn the first expectation around: the motor is stopped at 0 ms, and the scenario now says it runs.
        const first = scenario.expectations[0]!;
        expect(first.kind).toBe('AT');
        first.condition = Object.fromEntries(Object.entries(first.condition).map(([signal, value]) => [signal, !value]));
        writeFileSync(file, JSON.stringify(scenario, null, 2));

        const direct = (await testsRun(root)) as TestRunResult;
        expect(direct.ok).toBe(false);
        const cli = await viaCli(['test', root]);
        const mcp = await viaMcp(root, 'tests_run');
        expect(essence(cli.json)).toEqual(essence(direct));
        expect(essence(mcp)).toEqual(essence(direct));
        expect(cli.code).toBe(1);
        expect(essence(direct).diagnostics.some((diagnostic) => diagnostic.startsWith('SCENARIO_ASSERTION_FAILED'))).toBe(true);
        expect(presentWorkspaceTestResult(direct).kind).toBe('assertion-failed');
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
