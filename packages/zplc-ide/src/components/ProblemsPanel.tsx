/**
 * @file ProblemsPanel.tsx
 * @brief The Problems tab of the results panel (IDE-020): the live diagnostics of the open file, then the latest build's,
 * errors first. Activating one opens its exact location through `onActivate`.
 */

import { XCircle, AlertCircle, Info } from 'lucide-react';
import { useT } from '../i18n';
import { Button } from '../ui';
import { findFileInTree } from '../utils/fileSystem';
import type { FileTreeNode } from '../types';
import { CommandEmptyState } from './panelStates';
import { orderProblems } from './consoleAttention';

// The two lists have the shape the compiler reports; the panel reads what it shows.
type Problem = {
  type: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  errorCode?: string;
  element?: string;
};

export function ProblemsPanel({
  summary,
  live,
  buildMessages,
  checked,
  fileTree,
  activeFilePath,
  onActivate,
}: {
  summary: string;
  live: Problem[];
  buildMessages: Problem[];
  checked: boolean;
  fileTree: FileTreeNode | null;
  activeFilePath?: string;
  onActivate: (message: Problem) => void;
}): React.ReactElement {
  const { t } = useT();
  return (
    <div className="p-2 space-y-1">
      <div className="pb-1 text-xs tabular-nums text-[var(--color-surface-300)] border-b border-[var(--color-surface-700)]">{summary}</div>
      {live.length > 0 && (
        <section
          aria-label={t('console.liveStructuredTextDiagnostics')}
          className="space-y-1 pb-2 border-b border-[var(--color-surface-700)]"
        >
          <div className="px-2 text-xs text-[var(--color-surface-300)]">{t('console.liveStDiagnosticsNot')}</div>
          {live.map((msg, idx) => (
            <div key={`${msg.code}-${idx}`} className="flex items-start gap-2 rounded px-2 py-1">
              {msg.type === 'error' ? (
                <XCircle size={14} className="text-[var(--color-accent-red)] mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle size={14} className="text-[var(--color-accent-yellow)] mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <span className="sr-only">{msg.type === 'warning' ? t('console.warning') : t('console.error')}: </span>
                <span className="text-[var(--color-surface-100)]">{msg.message}</span>
                {(msg.file ?? activeFilePath) && (
                  <span className="ml-2 text-[var(--color-surface-400)] text-xs">
                    {msg.file ?? activeFilePath}
                    {msg.line !== undefined && `:${msg.line}`}
                    {msg.column !== undefined && `:${msg.column}`}
                  </span>
                )}
                {msg.errorCode && (
                  <span data-diagnostic-code className="ml-2 font-mono text-[var(--color-surface-400)] text-xs">
                    {msg.errorCode}
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      <section aria-label={t('console.latestBuildDiagnostics')} className="space-y-1">
        <div className="px-2 text-xs text-[var(--color-surface-300)]">{t('console.latestBuildDiagnostics')}</div>
        {buildMessages.length === 0
          ? null
          : orderProblems(buildMessages).map((msg, idx) => {
              const node = msg.file && fileTree ? findFileInTree(fileTree, msg.file) : null;
              // a diagram has no lines: a finding of its translation has no position, and its element is found on activation
              const inDiagram = node?.type === 'file' && (node.language === 'LD' || node.language === 'FBD' || node.language === 'SFC');
              const navigable = Boolean(node?.type === 'file' && node.path === msg.file && ((msg.line && msg.line >= 1) || inDiagram));
              const content = (
                <>
                  {msg.type === 'error' && <XCircle size={14} className="text-[var(--color-accent-red)] mt-0.5 flex-shrink-0" />}
                  {msg.type === 'warning' && <AlertCircle size={14} className="text-[var(--color-accent-yellow)] mt-0.5 flex-shrink-0" />}
                  {msg.type === 'info' && <Info size={14} className="text-[var(--color-accent-blue)] mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <span className="sr-only">
                      {msg.type === 'info' ? t('console.info') : msg.type === 'warning' ? t('console.warning') : t('console.error')}:{' '}
                    </span>
                    <span className="text-[var(--color-surface-100)]">{msg.message}</span>
                    {msg.file && (
                      <span className="ml-2 text-[var(--color-surface-400)] text-xs">
                        {msg.file}
                        {msg.line !== undefined && `:${msg.line}`}
                        {msg.column !== undefined && `:${msg.column}`}
                      </span>
                    )}
                    {msg.code && (
                      <span data-diagnostic-code className="ml-2 font-mono text-[var(--color-surface-400)] text-xs">
                        {msg.code}
                      </span>
                    )}
                  </div>
                </>
              );
              return navigable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  key={idx}
                  onClick={() => {
                    void onActivate(msg);
                  }}
                  className="h-auto w-full items-start justify-start whitespace-normal py-1 text-left"
                >
                  {content}
                </Button>
              ) : (
                <div key={idx} className="flex items-start gap-2 rounded px-2 py-1">
                  {content}
                </div>
              );
            })}
      </section>
      {buildMessages.length === 0 && (
        <CommandEmptyState
          title={t('panel.problems.empty.title')}
          description={checked ? t('panel.problems.empty.checked') : t('panel.problems.empty.unchecked')}
          actions={['build.compile']}
        />
      )}
    </div>
  );
}
