/**
 * The proposals of the assistant that are not a change set, as buttons (IDE-030): an editor action, or a display setting with its current
 * and its proposed value. Each is checked against the project and offered only when it can run; nothing runs until the person clicks it.
 */
import { useCallback, useEffect, useState } from 'react';
import { runCommand } from '../../commands/bus';
import { requestElementSelection } from '../../editors/elementSelectionRequests';
import { useT } from '../../i18n';
import type { AiProposal } from '../../ai/proposals';
import { useAppSettings } from '../../store/useAppSettings';
import { useIDEStore } from '../../store/useIDEStore';
import { Button } from '../../ui';
import { checkProposals, runProposal, type ProposalCheck, type ProposalDeps } from './editorProposals';

type SettingName = 'theme' | 'language' | 'density' | 'editorFontSize' | 'editorTabSize';

function liveDeps(): ProposalDeps {
  const store = useIDEStore.getState();
  return {
    isProjectOpen: store.isProjectOpen,
    fileTree: store.fileTree,
    loadedFiles: store.loadedFiles,
    openFile: store.openFile,
    navigate: store.navigateToCompilerDiagnostic,
    selectElement: (path, element) => requestElementSelection(path, element),
    runCommand: (id) => runCommand(id, { respectEnabled: true }),
    currentSetting: (name: SettingName) => (name === 'theme' ? store.theme : useAppSettings.getState().settings[name]),
    applySetting: (name: SettingName, value) => {
      // the theme and the other settings are applied by the setters the settings screen uses; a value outside its choices is ignored there
      if (name === 'theme') store.setTheme(value as never);
      else useAppSettings.getState().update({ [name]: value });
    },
  };
}

export function AgentProposals({ proposals }: { proposals: readonly AiProposal[] }) {
  const { t } = useT();
  const theme = useIDEStore((state) => state.theme);
  const settings = useAppSettings((state) => state.settings);
  const [checks, setChecks] = useState<ProposalCheck[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void checkProposals(proposals, liveDeps()).then((next) => {
      if (current) setChecks(next);
    });
    return () => {
      current = false;
    };
  }, [proposals, theme, settings]);

  const label = useCallback(
    (proposal: AiProposal): string => {
      switch (proposal.type) {
        case 'openFile':
          return t('console.proposalOpenFile', { path: proposal.path });
        case 'goToLine':
          return t('console.proposalGoToLine', { line: proposal.line, path: proposal.path });
        case 'selectElement':
          return t('console.proposalSelectElement', { element: decodeURIComponent(proposal.element), path: proposal.path });
        case 'compile':
          return t('console.proposalCompile');
        case 'generateSt':
          return t('console.proposalGenerateSt');
        case 'startSimulation':
          return t('console.proposalStartSimulation');
        case 'setting': {
          const name =
            proposal.name === 'theme'
              ? t('console.settingTheme')
              : proposal.name === 'language'
                ? t('console.settingLanguage')
                : proposal.name === 'density'
                  ? t('console.settingDensity')
                  : proposal.name === 'editorFontSize'
                    ? t('console.settingFontSize')
                    : t('console.settingTabSize');
          return t('console.proposalSetting', { setting: name, value: String(proposal.value) });
        }
      }
    },
    [t],
  );
  const reason = (check: ProposalCheck): string =>
    check.state === 'missing-file'
      ? t('console.proposalWhyFile')
      : check.state === 'missing-line'
        ? t('console.proposalWhyLine')
        : check.state === 'missing-element'
          ? t('console.proposalWhyElement')
          : check.state === 'same'
            ? t('console.proposalWhySame')
            : t('console.proposalWhyProject');

  if (proposals.length === 0) return null;
  return (
    <section aria-label={t('console.proposedActions')} className="space-y-1 text-xs">
      <h3 className="font-medium text-[var(--color-surface-200)]">{t('console.proposedActions')}</h3>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={JSON.stringify(check.proposal)} className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={check.state !== 'ready'}
              onClick={() => {
                void runProposal(check.proposal, liveDeps()).then((outcome) =>
                  setMessage(
                    outcome === 'ran'
                      ? t('console.proposalDone', { action: label(check.proposal) })
                      : t('console.proposalNotRun', { action: label(check.proposal) }),
                  ),
                );
              }}
            >
              {label(check.proposal)}
            </Button>
            {check.state === 'ready' && check.current !== undefined && (
              <span className="text-[var(--color-surface-400)]">{t('console.proposalNow', { value: String(check.current) })}</span>
            )}
            {check.state !== 'ready' && <span className="text-[var(--color-accent-yellow)]">{reason(check)}</span>}
          </li>
        ))}
      </ul>
      {message && (
        <p role="status" className="text-[var(--color-surface-300)]">
          {message}
        </p>
      )}
    </section>
  );
}
