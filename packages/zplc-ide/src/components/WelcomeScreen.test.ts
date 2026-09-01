import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

describe('Welcome screen contract', () => {
  it('offers only folder-backed project starts and an explicit theme control', () => {
    const source = readFileSync(join(import.meta.dir, 'WelcomeScreen.tsx'), 'utf8');

    expect(source).toContain('ZPLC Studio 2.0');
    expect(source).toContain('Open project');
    expect(source).toContain('New project');
    expect(source).toContain('Copy example');
    expect(source).toContain('Choose or create a destination folder');
    expect(source).toContain('The copy stops if a destination file already exists');
    expect(source).toContain('copyExampleProjectToFolder');
    expect(source).toContain('aria-label={`Switch to ${isDark');
    expect(source).toContain('cursor-not-allowed text-[var(--text-primary)] opacity-60');
    expect(source).toContain('data-welcome-example');
    expect(source).toContain('isCopyingExample');
    expect(source).toContain('copyingExampleRef.current');
    expect(source).not.toContain('local-first');
    expect(source).not.toContain('Temporary project');
    expect(source).not.toContain('Examples open in memory');
    expect(source).not.toContain('Industrial PLC Development Environment');
    expect(source).not.toContain('Zephyr RTOS Target');
    expect(source).not.toContain('Chrome');
  });
});
