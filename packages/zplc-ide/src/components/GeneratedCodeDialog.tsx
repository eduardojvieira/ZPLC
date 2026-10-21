/**
 * Generated Code Dialog
 *
 * Modal dialog to display and copy generated code
 * (Structured Text from visual languages, or Assembly from compiler).
 */

import { useState } from 'react';
import { useT } from '../i18n';
import { Copy, Check, Download, FileText } from 'lucide-react';
import { ICON_SIZES } from '../theme/tokens';
import { Button } from '../ui';
import { Modal } from './Modal';

interface GeneratedCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceLanguage: 'FBD' | 'LD' | 'SFC' | 'ASM';
  generatedCode: string;
  /** Optional: callback to create a new file with this content */
  onCreateFile?: (code: string) => void;
}

export function GeneratedCodeDialog({ isOpen, onClose, sourceLanguage, generatedCode, onCreateFile }: GeneratedCodeDialogProps) {
  const { t, tn } = useT();
  const [copied, setCopied] = useState(false);

  const isAssembly = sourceLanguage === 'ASM';
  const title = isAssembly
    ? t('workbench.generated.titleAssembly')
    : t('workbench.generated.titleStructuredText', { language: sourceLanguage });

  const fileExtension = isAssembly ? '.asm' : '.st';
  const description = isAssembly
    ? t('workbench.generated.descriptionAssembly')
    : t('workbench.generated.descriptionStructuredText', { language: sourceLanguage });

  // Catches its own errors; the button starts it with `void`.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  const handleCreateFile = () => {
    onCreateFile?.(generatedCode);
    onClose();
  };

  const lineCount = generatedCode.split('\n').length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} widthClass="max-w-4xl">
      {/* Stats & Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
        <div className="flex items-center gap-4 text-sm text-[var(--color-surface-300)]">
          <span className="flex items-center gap-1">
            <FileText size={14} />
            {tn('workbench.generated.lines', lineCount)}
          </span>
          <span>{tn('workbench.generated.characters', generatedCode.length, { amount: generatedCode.length.toLocaleString() })}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              void handleCopy();
            }}
            icon={copied ? <Check size={ICON_SIZES.sm} className="text-[var(--color-accent-green)]" /> : <Copy size={ICON_SIZES.sm} />}
          >
            {copied ? t('workbench.generated.copied') : t('workbench.generated.copy')}
          </Button>

          {onCreateFile && (
            <Button size="sm" variant="primary" onClick={handleCreateFile} icon={<Download size={ICON_SIZES.sm} />}>
              {t('workbench.generated.createFile', { extension: fileExtension })}
            </Button>
          )}
        </div>
      </div>

      {/* Code Display */}
      <div className="p-4 overflow-auto max-h-[60vh]">
        <pre className="text-sm font-mono leading-relaxed text-[var(--color-surface-100)] whitespace-pre-wrap">
          <code>{generatedCode}</code>
        </pre>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--color-surface-600)] bg-[var(--color-surface-700)]">
        <p className="text-xs text-[var(--color-surface-400)]">{description}</p>
      </div>
    </Modal>
  );
}
