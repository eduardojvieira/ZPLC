/**
 * The compiler sources keep to their lint rules (CMP-061)
 *
 * SPDX-License-Identifier: MIT
 *
 * The compiler package has no linter of its own: this test runs the one the repository has, on the sources
 * of the compiler that are not tests. Its rules are the ones that keep the code typed (no `any`) and keep
 * thinking-aloud and task notes out of the comments.
 */

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const compilerRoot = resolve(import.meta.dir, '..', '..', '..', 'zplc-compiler');

describe('the sources of the compiler that are not tests (CMP-061)', () => {
  test('hold no `any` and no leftover note in a comment', async () => {
    const eslint = new ESLint({
      cwd: compilerRoot,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['src/**/*.ts'],
          ignores: ['**/*.test.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { '@typescript-eslint': tseslint.plugin },
          rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            'no-warning-comments': [
              'error',
              {
                terms: ['todo', 'fixme', 'xxx', 'hmm', 'for now', 'actually,', 'wait,', 'let me', "let's"],
                location: 'anywhere',
              },
            ],
          },
        },
      ],
    });
    const results = await eslint.lintFiles(['src/**/*.ts']);
    const findings = results.flatMap((result) =>
      result.messages.map(
        (message) =>
          `${result.filePath.slice(
            compilerRoot.length + 1,
          )}:${message.line}:${message.column} ${message.ruleId ?? 'parse'}: ${message.message}`,
      ),
    );
    expect(results.length).toBeGreaterThan(30);
    expect(findings).toEqual([]);
  });
});
