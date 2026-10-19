/**
 * The Build dropdown of the toolbar (IDE-014: split out of Toolbar.tsx).
 */

import { Hammer, ChevronDown, FileCode, Download } from 'lucide-react';
import { useT } from '../i18n';
import { shortcutText, withShortcut } from '../commands/shortcutLabels';
import { ProjectExportItems } from './ProjectExportItems';
import type { useDropdownMenu } from './useDropdownMenu';
import { Button } from '../ui';

export function BuildMenu({ menu, onCompile, onDownloadBytecode, onViewAssembly, hasCurrentCompileResult }: {
  menu: ReturnType<typeof useDropdownMenu>;
  onCompile: () => void;
  onDownloadBytecode: () => void;
  onViewAssembly: () => void;
  hasCurrentCompileResult: boolean;
}) {
  const { open, menuRef, triggerRef, firstItemRef, openMenu: onOpen, closeMenu: onClose } = menu;
  const { t } = useT();
  return (
  <div className="relative" ref={menuRef} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(true); } }}>
    <Button variant="bare"
      ref={triggerRef}
      type="button"
      onClick={() => open ? onClose() : onOpen()}
      className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-100)] text-xs font-medium transition-colors"
      aria-label={t('toolbar.build.label')}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls="toolbar-build-menu"
      tooltip={t('toolbar.build.label')}
    >
      <Hammer size={14} />
      <span>{t('toolbar.build.text')}</span>
      <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </Button>

    {open && (
      <div id="toolbar-build-menu" role="menu" aria-label={t('toolbar.build.label')} className="absolute left-0 top-full mt-1 py-1 w-44 bg-[var(--color-surface-700)] border border-[var(--color-surface-600)] rounded-lg shadow-lg z-50">
        <Button variant="bare"
          ref={firstItemRef}
          type="button"
          role="menuitem"
          onClick={() => { onCompile(); }}
          className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)] transition-colors"
          aria-label={withShortcut(t('toolbar.compile.label'), 'build.compile')}
        >
          <Hammer size={14} />
          <span>{t('toolbar.compile.text')}</span>
          <span className="ml-auto text-xs text-[var(--color-surface-400)]">{shortcutText('build.compile')}</span>
        </Button>
        <div className="h-px bg-[var(--color-surface-600)] my-1" />
        <Button variant="bare"
          type="button"
          role="menuitem"
          onClick={onDownloadBytecode}
          disabled={!hasCurrentCompileResult}
          className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={t('toolbar.download.label')}
        >
          <Download size={14} />
          <span>{t('toolbar.download.text')}</span>
        </Button>
        <Button variant="bare"
          type="button"
          role="menuitem"
          onClick={onViewAssembly}
          disabled={!hasCurrentCompileResult}
          className="focus-ring w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-surface-100)] hover:bg-[var(--menu-item-bg-active)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={t('toolbar.assembly.label')}
        >
          <FileCode size={14} />
          <span>{t('toolbar.assembly.text')}</span>
        </Button>
        <div className="h-px bg-[var(--color-surface-600)] my-1" />
        <ProjectExportItems />
      </div>
    )}
  </div>
  );
}
