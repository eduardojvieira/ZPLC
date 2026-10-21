import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { en } from '../i18n/en';
import { compactSource } from '../i18n/inlineMessages';

describe('Sidebar migration disclosure', () => {
  it(
    'keeps the migration notice read-only and discoverable in the lower Explorer ledger tab, with the difference in a dialog of its ' +
      'own',
    () => {
      const source = compactSource(readFileSync(join(import.meta.dir, 'Sidebar.tsx'), 'utf8'));

      // The texts are in the catalog (UX-029); the explorer writes them through t().
      expect(en['explorer.migration.heading']).toBe('Migration preview');
      expect(en['explorer.migration.unchanged']).toBe('No project files were changed.');
      expect(en['explorer.migration.review.other']).toContain('Review the difference (');
      for (const key of ['explorer.migration.heading', 'explorer.migration.unchanged']) expect(source).toContain(`t('${key}')`);
      expect(source).toContain("tn('explorer.migration.review'");
      expect(source).toContain('<MigrationPreviewDialog onClose={() => setIsMigrationOpen(false)} />');
      expect(source).toContain("aria-label={t('explorer.actions')}");
      expect(en['explorer.actions']).toBe('Explorer actions');
      // The icon buttons are the kit's IconButton: `label` is the accessible name, and the kit's tests prove it (ui/kit.test.tsx).
      expect(source).toContain("label={t('explorer.newFile')}");
      expect(source).toContain("label={t('explorer.refresh')}");
      expect(source).not.toContain('Close Explorer');
      expect(source).not.toContain('Apply migration');
    },
  );

  // Fails without the FileNameTakenError branch in the New File dialog: the dialog showed the generic "Could not create the file" text.
  it('shows the reason when New File refuses a name that is taken, instead of the generic failure text', () => {
    const source = compactSource(readFileSync(join(import.meta.dir, 'Sidebar.tsx'), 'utf8'));

    expect(source).toContain('error instanceof FileNameTakenError');
    expect(source).toContain("from '../utils/fileSystem'");
  });

  it('keeps a failed new-file creation visible and accessible', () => {
    const source = compactSource(readFileSync(join(import.meta.dir, 'Sidebar.tsx'), 'utf8'));

    // The error goes to the kit's TextField, whose Field announces it (role="alert"), marks the input invalid and describes it
    // (aria-invalid, aria-describedby): ui/kit.test.tsx proves those, so the dialog only has to hand the message over.
    expect(source).toContain('error={error ?? undefined}');
    expect(source).not.toContain('<input');
    expect(source).toContain('disabled={!fileName.trim() || isCreating}');
    expect(source).toContain('setTimeout(() => inputRef.current?.select(), 0)');
    expect(source).toContain('setError(null); onFileNameChange(e.target.value);');
    expect(source).toContain('setError(null); onLanguageChange(e.target.value as PLCLanguage);');
    expect(source).toContain('showCloseButton={!isCreating}');
    expect(source).toContain('disabled={isCreating}');
    expect(source).toContain('key={newFileModalEpoch}');
    expect(source).toContain('setNewFileModalEpoch((epoch) => epoch + 1)');
    expect(source).toContain("error.message === 'The file may exist on disk. Refresh the project before trying again.'");
    expect(source).toContain('readOnly={isCreating}');
    expect(source).not.toContain("console.error('Failed to create file:'");
  });
});
