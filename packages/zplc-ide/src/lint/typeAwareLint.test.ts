// VF-011: an unhandled promise is a CI failure. The two rules need type information, so this lints probe text
// through the package's own ESLint configuration, hosted by this file so that it belongs to a TypeScript project.
import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const hostFile = fileURLToPath(import.meta.url);

async function lint(code: string): Promise<Array<{ rule: string | null; severity: number; line: number }>> {
  // With CI=true typescript-estree assumes a single run and reads the file from disk, ignoring the probe text.
  const single = process.env.TSESTREE_SINGLE_RUN;
  process.env.TSESTREE_SINGLE_RUN = 'false';
  try {
    const [result] = await new ESLint({ cwd: packageRoot }).lintText(code, { filePath: hostFile });
    return (result?.messages ?? []).map((message) => ({ rule: message.ruleId, severity: message.severity, line: message.line }));
  } finally {
    if (single === undefined) delete process.env.TSESTREE_SINGLE_RUN;
    else process.env.TSESTREE_SINGLE_RUN = single;
  }
}

describe('type-aware promise rules (VF-011)', () => {
  test('an unawaited promise is an error', async () => {
    const messages = await lint('async function load(): Promise<void> {}\nload();\n');
    expect(messages).toEqual([{ rule: '@typescript-eslint/no-floating-promises', severity: 2, line: 2 }]);
  }, 30_000);

  test('a promise-returning function where a void callback is expected is an error', async () => {
    const messages = await lint('async function load(): Promise<void> {}\nconst onClick: () => void = async () => { await load(); };\nvoid onClick;\n');
    expect(messages).toEqual([{ rule: '@typescript-eslint/no-misused-promises', severity: 2, line: 2 }]);
  }, 30_000);

  test('an awaited, voided or caught promise passes', async () => {
    const code = [
      'async function load(): Promise<void> {}',
      'async function run(): Promise<void> { await load(); }',
      'void run();',
      'load().catch(() => undefined);',
      'const onClick: () => void = () => { void load(); };',
      'void onClick;',
      '',
    ].join('\n');
    expect(await lint(code)).toEqual([]);
  }, 30_000);
});
