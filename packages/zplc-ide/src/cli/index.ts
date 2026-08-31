#!/usr/bin/env bun
import { randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import productManifest from '../../../../package.json';
import { compileSingleFileWithTask, type PLCLanguage } from '../compiler';
import { getLanguageFromFilename } from '../types';
import { artifactEvidence, compilerCheck, compilerCompile, firmwareBuild, projectInspect, projectMigrationExport, projectMigrationPreview, projectValidate, safetyCheck, scenarioRun, symbolsList, testsRun, toolchainInspect, type FirmwareBuildSummary, type ProjectMigrationExportResult, type TestRunResult, type ToolEvidence, type ToolResult } from './toolApi';

type Values = { help?: boolean; version?: boolean; json?: boolean; output?: string; language?: string };
type Output = Pick<typeof console, 'log' | 'error'>;
type ParsedArgs = { values: Values; positionals: string[] };

function parseCliArgs(args: string[]): ParsedArgs | undefined {
  try { return parseArgs({ args, options: { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, json: { type: 'boolean', short: 'j' }, output: { type: 'string', short: 'o' }, language: { type: 'string', short: 'l' } }, allowPositionals: true }) as ParsedArgs; }
  catch { return undefined; }
}

export function isInterruptibleInvocation(args: string[]): boolean {
  const parsed = parseCliArgs(args);
  if (parsed?.values.help || parsed?.values.version) return false;
  const command = parsed?.positionals[0];
  return command === 'firmware-build' || command === 'test' || command === 'scenario-run';
}

export function isFirmwareBuildInvocation(args: string[]): boolean { return parseCliArgs(args)?.positionals[0] === 'firmware-build'; }

function printHelp(output: Output): void {
  output.log(`ZPLC CLI\n\nUsage:\n  zplc-cli inspect <workspace> --json\n  zplc-cli validate <workspace> --json\n  zplc-cli check <workspace> --json\n  zplc-cli safety-check <workspace> [--json]\n  zplc-cli symbols <workspace> [--json]\n  zplc-cli migrate-preview <workspace> [--json]\n  zplc-cli migrate <workspace> --output <manifest-v2.json> [--json]\n  zplc-cli test <workspace> [--json] [--output <trace.json>]\n  zplc-cli scenario-run <workspace> <scenario-id> [--json] [--output <trace.json>]\n  zplc-cli toolchain-inspect <zplc-repository-root> [--json]\n  zplc-cli firmware-build <zplc-repository-root> <ide_id> [--json]\n  zplc-cli compile <workspace|source-file> [--json] [--output <file>] [--language ST|IL|LD|FBD|SFC]\n\nFirmware builds are local POSIX ephemeral cross-builds only: they do not flash, deploy, or qualify hardware.\n\nOptions:\n  -h, --help        Show this help\n  -v, --version     Show version\n  -j, --json        Output one JSON result line\n  -o, --output <f>  Write the requested artifact\n  -l, --language <l> Source language (ST, IL, LD, FBD, SFC)`);
}
function failure(operation: ToolEvidence['operation'], message: string): ToolEvidence { return { schemaVersion: 1, operation, outcome: 'failed', diagnostics: [{ code: 'CLI_INVALID', message }], artifacts: [] }; }
function emitJson(output: Output, value: unknown): void { output.log(JSON.stringify(value)); }
function emitFailure(output: Output, json: boolean, operation: ToolEvidence['operation'], message: string): number { if (json) emitJson(output, { ok: false, evidence: failure(operation, message) }); else output.error(`Error: ${message}`); return 1; }
export function firmwareBuildExitCode(result: ToolResult<FirmwareBuildSummary>): number {
  if (result.ok) return 0;
  const code = result.evidence.diagnostics[0]?.code;
  return code === 'FIRMWARE_BUILD_CANCELLED' ? 130 : code === 'FIRMWARE_BUILD_TIMEOUT' ? 124 : 1;
}
export function testExitCode(result: TestRunResult): number {
  if (result.ok) return 0;
  const code = result.evidence.diagnostics[0]?.code;
  return code === 'TEST_CANCELLED' ? 130 : code === 'TEST_TIMEOUT' ? 124 : 1;
}
function cliTestResult(result: TestRunResult): TestRunResult {
  if (result.ok || !['TEST_CANCELLED', 'TEST_TIMEOUT'].includes(result.evidence.diagnostics[0]?.code ?? '')) return result;
  return { ok: false, evidence: { ...result.evidence, artifacts: [] } };
}
function languageFor(file: string, requested?: string): PLCLanguage | null {
  if (!requested && !/\.(st|il|ld\.json|fbd\.json|sfc\.json)$/i.test(file)) return null;
  const language = (requested ?? getLanguageFromFilename(file)).toUpperCase();
  return language && ['ST', 'IL', 'LD', 'FBD', 'SFC'].includes(language) ? language as PLCLanguage : null;
}
async function writeArtifact(path: string, bytes: Uint8Array): Promise<boolean> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try { await writeFile(temporary, bytes); await rename(temporary, path); return true; }
  catch { await rm(temporary, { force: true }).catch(() => undefined); return false; }
}
function samePath(left: string, right: string): boolean { return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right; }
function within(root: string, path: string): boolean { const value = relative(root, path); return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value); }
async function canonicalOrResolved(path: string): Promise<string> {
  try { return await realpath(path); }
  catch {
    const parent = dirname(path);
    try { return join(await realpath(parent), basename(path)); }
    catch { return resolve(path); }
  }
}
async function isProtectedOutput(outputPath: string, input: string, workspace: boolean): Promise<boolean> {
  const rawOutput = resolve(outputPath);
  const output = await canonicalOrResolved(outputPath);
  const protectedInput = await canonicalOrResolved(workspace ? join(input, 'zplc.json') : input);
  if (samePath(rawOutput, resolve(workspace ? join(input, 'zplc.json') : input)) || samePath(output, protectedInput)) return true;
  if (!workspace) return false;
  for (const directory of ['src', 'tests']) {
    const rawDirectory = resolve(input, directory);
    const canonicalDirectory = await canonicalOrResolved(join(input, directory));
    if (samePath(rawOutput, rawDirectory) || samePath(output, canonicalDirectory) || within(rawDirectory, rawOutput) || within(canonicalDirectory, output)) return true;
  }
  return false;
}
async function singleFileCompile(file: string, values: Values, output: Output): Promise<number> {
  const json = values.json === true;
  let status;
  try { status = await lstat(file); } catch { return emitFailure(output, json, 'compile', 'Input file is unavailable'); }
  if (status.isSymbolicLink() || !status.isFile()) return emitFailure(output, json, 'compile', 'Input must be a regular source file');
  if (values.output && await isProtectedOutput(values.output, file, false)) return emitFailure(output, json, 'compile', 'Output path is protected');
  const language = languageFor(file, values.language);
  if (!language) return emitFailure(output, json, 'compile', 'Unsupported source language');
  try {
    const result = compileSingleFileWithTask(await readFile(file, 'utf8'), language, { taskName: 'Main', intervalMs: 50, priority: 3, programName: 'Main' });
    const artifact = values.output?.toLowerCase().endsWith('.bin') ? result.bytecode : result.zplcFile;
    if (values.output && !await writeArtifact(values.output, artifact)) return emitFailure(output, json, 'compile', 'Unable to write output artifact');
    if (json) emitJson(output, { ok: true, summary: { codeSize: result.codeSize, language }, evidence: { schemaVersion: 1, operation: 'compile', outcome: 'passed', diagnostics: [], artifacts: [artifactEvidence(values.output?.toLowerCase().endsWith('.bin') ? 'bytecode' : 'zplc', artifact)] } });
    else if (values.output) output.log(`Compiled ${file} (${result.codeSize} bytes)`);
    else output.log(result.assembly);
    return 0;
  } catch { return emitFailure(output, json, 'compile', 'Compilation failed'); }
}

export async function main(args = Bun.argv.slice(2), output: Output = console, options: { signal?: AbortSignal } = {}): Promise<number> {
  const jsonRequested = args.includes('--json') || args.includes('-j');
  const parsed = parseCliArgs(args);
  if (!parsed) return emitFailure(output, jsonRequested, 'cli', 'Invalid command arguments');
  const { values, positionals } = parsed;
  if ((values.help || values.version) && values.json) return emitFailure(output, true, 'cli', 'JSON cannot be combined with help or version');
  if (values.help) { printHelp(output); return 0; }
  if (values.version) { output.log(`zplc-cli ${productManifest.version}`); return 0; }
  const [command, input, ideId] = positionals;
  if (!command || !['inspect', 'validate', 'check', 'safety-check', 'compile', 'symbols', 'test', 'scenario-run', 'migrate-preview', 'migrate', 'toolchain-inspect', 'firmware-build'].includes(command)) return emitFailure(output, values.json === true, 'cli', 'Unknown command');
  if (command === 'firmware-build') {
    if (!input || !ideId || !/^[a-z0-9][a-z0-9_]{0,63}$/.test(ideId) || positionals.length !== 3 || values.output !== undefined || values.language !== undefined) return emitFailure(output, values.json === true, 'firmware-build', 'Firmware build requires a repository root and exact ide_id without output or language options');
    let rootStatus;
    try { rootStatus = await lstat(input); } catch { return emitFailure(output, values.json === true, 'firmware-build', 'Firmware build requires a real repository directory'); }
    if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) return emitFailure(output, values.json === true, 'firmware-build', 'Firmware build requires a real repository directory');
    const result = await firmwareBuild(input, ideId, { signal: options.signal });
    if (values.json) emitJson(output, result);
    else if (result.ok) output.log('Local ephemeral cross-build passed');
    else output.error(`Firmware build failed (${result.evidence.diagnostics[0]?.code ?? 'FIRMWARE_BUILD_UNAVAILABLE'})`);
    return firmwareBuildExitCode(result);
  }
  if (command === 'scenario-run' && (!input || !ideId || ideId.length > 128 || ideId.includes('\0') || positionals.length !== 3 || values.language !== undefined || values.output === '')) return emitFailure(output, values.json === true, 'scenario-run', 'Scenario run requires a workspace and valid scenario id without a language option');
  if (command !== 'scenario-run' && (!input || positionals.length !== 2)) return emitFailure(output, values.json === true, 'cli', 'Expected one command and one input');
  if ((command === 'inspect' || command === 'validate' || command === 'check' || command === 'safety-check' || command === 'symbols' || command === 'migrate-preview' || command === 'toolchain-inspect') && (values.output !== undefined || values.language !== undefined)) return emitFailure(output, values.json === true, command, 'This command does not accept output or language options');
  if (command === 'migrate' && (values.output === undefined || values.output === '' || values.language !== undefined)) return emitFailure(output, values.json === true, command, 'Migration requires a non-empty output path without a language option');
  if (command === 'test' && values.language !== undefined) return emitFailure(output, values.json === true, command, 'Test does not accept a language option');
  let status;
  try { status = await lstat(input); } catch { return emitFailure(output, values.json === true, command, 'Input is unavailable'); }
  if (command === 'toolchain-inspect' && (status.isSymbolicLink() || !status.isDirectory())) return emitFailure(output, values.json === true, command, 'This command requires a real repository directory');
  if ((command === 'compile' || command === 'test' || command === 'scenario-run') && values.output === '') return emitFailure(output, values.json === true, command, `${command === 'compile' ? 'Compile' : 'Test'} output must not be empty`);
  if (command === 'compile' && values.language !== undefined && status.isDirectory()) return emitFailure(output, values.json === true, command, 'Workspace compilation does not accept a language option');
  if (command !== 'compile' && !status.isDirectory()) return emitFailure(output, values.json === true, command, 'This command requires a workspace directory');
  if (command === 'compile' && status.isFile()) return singleFileCompile(input, values, output);
  if (command === 'compile' && !status.isDirectory()) return emitFailure(output, values.json === true, command, 'Input must be a workspace directory or regular source file');
  if ((command === 'compile' || command === 'test' || command === 'scenario-run' || command === 'migrate') && values.output && await isProtectedOutput(values.output, input, true)) return emitFailure(output, values.json === true, command, 'Output path is protected');
  const result = command === 'inspect' ? await projectInspect(input) : command === 'validate' ? await projectValidate(input) : command === 'migrate-preview' ? await projectMigrationPreview(input) : command === 'migrate' ? await projectMigrationExport(input) : command === 'check' ? await compilerCheck(input) : command === 'safety-check' ? await safetyCheck(input) : command === 'symbols' ? await symbolsList(input) : command === 'test' ? cliTestResult(await testsRun(input, { signal: options.signal })) : command === 'scenario-run' ? cliTestResult(await scenarioRun(input, ideId!, { signal: options.signal })) : command === 'toolchain-inspect' ? await toolchainInspect(input) : await compilerCompile(input);
  if (result.ok && command === 'migrate' && !await writeArtifact(values.output!, (result as ProjectMigrationExportResult).manifest!)) return emitFailure(output, values.json === true, command, 'Unable to write output artifact');
  if (result.ok && command === 'compile' && values.output && !await writeArtifact(values.output, result.bytes!)) return emitFailure(output, values.json === true, command, 'Unable to write output artifact');
  if ((command === 'test' || command === 'scenario-run') && values.output && (result as TestRunResult).traceFile && !await writeArtifact(values.output, (result as TestRunResult).traceFile!)) return emitFailure(output, values.json === true, command, 'Unable to write output artifact');
  if (values.json) emitJson(output, result);
  else if (result.ok && command === 'safety-check' && !result.summary.configured) output.log('safety-check: no incompatible outputs declared');
  else if (result.ok && command === 'safety-check') output.log('safety-check coverage checked');
  else if (result.ok) output.log(`${command} passed`); else result.evidence.diagnostics.forEach((diagnostic) => output.error(`Error: ${diagnostic.message}`));
  return command === 'test' || command === 'scenario-run' ? testExitCode(result as TestRunResult) : result.ok ? 0 : 1;
}

async function runEntrypoint(args = Bun.argv.slice(2)): Promise<number> {
  if (!isInterruptibleInvocation(args)) return main(args);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on('SIGINT', abort);
  try { return await main(args, console, { signal: controller.signal }); }
  finally { process.off('SIGINT', abort); }
}

if (import.meta.main) process.exitCode = await runEntrypoint();
