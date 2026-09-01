import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

describe('Sidebar migration disclosure', () => {
  it('keeps the migration preview accessible, read-only, and discoverable in the lower Explorer ledger tab', () => {
    const source = readFileSync(join(import.meta.dir, 'Sidebar.tsx'), 'utf8');

    expect(source).toContain('<details');
    expect(source).toContain('<summary');
    expect(source).toContain('Migration preview');
    expect(source).toContain('No project files were changed.');
    expect(source).toContain('Review {projectMigrationPreview.changes.length} change');
    expect(source).toContain("Add");
    expect(source).toContain("Remove");
    expect(source).toContain("Replace");
    expect(source).toContain('aria-label="Explorer actions"');
    expect(source).toContain('aria-label="New File"');
    expect(source).toContain('aria-label="Refresh"');
    expect(source).not.toContain('Close Explorer');
    expect(source).not.toContain('Apply migration');
  });

  it('keeps a failed new-file creation visible and accessible', () => {
    const source = readFileSync(join(import.meta.dir, 'Sidebar.tsx'), 'utf8');

    expect(source).toContain('role="alert"');
    expect(source).toContain('aria-describedby={error ?');
    expect(source).toContain("aria-invalid={error ? 'true' : undefined}");
    expect(source).toContain("disabled={!fileName.trim() || isCreating}");
    expect(source).toContain("setTimeout(() => inputRef.current?.select(), 0)");
    expect(source).toContain("setError(null); onFileNameChange(e.target.value);");
    expect(source).toContain("setError(null); onLanguageChange(e.target.value as PLCLanguage);");
    expect(source).toContain('showCloseButton={!isCreating}');
    expect(source).toContain('disabled={isCreating}');
    expect(source).toContain('key={newFileModalEpoch}');
    expect(source).toContain('setNewFileModalEpoch((epoch) => epoch + 1)');
    expect(source).toContain("error.message === 'The file may exist on disk. Refresh the project before trying again.'");
    expect(source).toContain('readOnly={isCreating}');
    expect(source).not.toContain("console.error('Failed to create file:'");
  });
});
