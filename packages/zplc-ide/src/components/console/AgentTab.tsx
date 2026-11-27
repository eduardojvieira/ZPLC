import { CircleStop, FileDiff, Send, X } from 'lucide-react';
import type { Ref } from 'react';
import { Button, Textarea } from '../../ui';
import { useT } from '../../i18n';
import { usePreferencesDocument } from '../../store/usePreferencesDocument';
import { AgentProposals } from '../agent/AgentProposals';
import { AnswerText } from '../agent/AnswerText';
import { HISTORY_TURNS } from '../agent/conversation';
import type { AttachedContext } from '../../store/useAssistantEntry';
import { visualViolationText } from '../../models/visualFileText';
import { AgentStatus, type AgentState } from '../ConsoleReviewPanels';
import { providerErrorText, type AiProviderMode, type AiProviderStatusPresentation } from '../aiProviderPresentation';

export interface AgentTabProps {
  agentMode: AiProviderMode;
  setAgentMode: (mode: AiProviderMode) => void;
  agentPrompt: string;
  setAgentPrompt: (prompt: string) => void;
  agentState: AgentState;
  setAgentState: (state: AgentState) => void;
  agentStatus: AiProviderStatusPresentation;
  agentBusy: boolean;
  agentCanSend: boolean;
  agentProposalCurrent: boolean;
  agentEditFile: { path: string } | undefined;
  agentContextFile: { path: string } | undefined;
  agentDiagnosticCount: number;
  agentTraceCount: number;
  hasCurrentWorkspaceLink: boolean;
  workspaceTestBusy: boolean;
  /** The context an entry point attached (AIX-003), removable. */
  chip: AttachedContext | null;
  removeChip: () => void;
  /** Turns held for the follow-up (AI-18) and the way to start again. */
  turnCount: number;
  newConversation: () => void;
  promptRef: Ref<HTMLTextAreaElement>;
  refreshAiProvider: () => Promise<void>;
  sendAgentRequest: () => Promise<void>;
  cancelAgentRequest: () => Promise<void>;
  reviewAgentProposal: () => Promise<void>;
}

export function AgentTab({
  agentMode,
  setAgentMode,
  agentPrompt,
  setAgentPrompt,
  agentState,
  setAgentState,
  agentStatus,
  agentBusy,
  agentCanSend,
  agentProposalCurrent,
  agentEditFile,
  agentContextFile,
  agentDiagnosticCount,
  agentTraceCount,
  hasCurrentWorkspaceLink,
  workspaceTestBusy,
  chip,
  removeChip,
  turnCount,
  newConversation,
  promptRef,
  refreshAiProvider,
  sendAgentRequest,
  cancelAgentRequest,
  reviewAgentProposal,
}: AgentTabProps) {
  const translator = useT();
  const { t } = translator;
  return (
    <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
      <section
        aria-label={t('console.optionalAgent')}
        className="max-w-3xl space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-surface-600)] pb-2">
          <div>
            <h2 className="font-medium text-[var(--color-surface-100)]">{t('assistant.heading')}</h2>
            <p className="mt-1 text-xs text-[var(--color-surface-400)]">{t('console.providerResponseNotEvidence')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!agentBusy) void refreshAiProvider();
            }}
            disabled={agentState === 'loading' || agentBusy}
          >
            {t('console.refreshStatus')}
          </Button>
        </div>
        <div role="radiogroup" aria-label={t('console.agentMode')} className="flex flex-wrap gap-1">
          {(['ask', 'plan', 'edit', 'debug'] as const).map((mode, index, modes) => (
            <Button
              variant="secondary"
              size="sm"
              key={mode}
              role="radio"
              aria-checked={agentMode === mode}
              tabIndex={agentMode === mode ? 0 : -1}
              disabled={agentBusy}
              onClick={() => {
                if (!agentBusy) {
                  setAgentMode(mode);
                  setAgentState('idle');
                }
              }}
              onKeyDown={(event) => {
                if (agentBusy) return;
                const next =
                  event.key === 'ArrowRight'
                    ? modes[(index + 1) % modes.length]
                    : event.key === 'ArrowLeft'
                      ? modes[(index + modes.length - 1) % modes.length]
                      : undefined;
                if (next) {
                  event.preventDefault();
                  setAgentMode(next);
                  document.getElementById(`agent-mode-${next}`)?.focus();
                }
              }}
              id={`agent-mode-${mode}`}
              tooltip={t(`assistant.mode.${mode}.tip`)}
              className={
                `border px-2.5 py-1 text-xs font-medium capitalize disabled:cursor-not-allowed ` +
                `disabled:opacity-60 ${
                  agentMode === mode
                    ? 'border-[var(--color-accent-blue)] ' + 'text-[var(--color-surface-100)]'
                    : 'border-[var(--color-surface-600)] text-[var(--color-surface-300)] ' + 'hover:bg-[var(--color-surface-700)]'
                }`
              }
            >
              {t(`assistant.mode.${mode}`)}
            </Button>
          ))}
        </div>
        {chip && (
          <div role="group" aria-label={t('assistant.chip.region')} className="space-y-1">
            <div className="inline-flex max-w-full items-center gap-1 border border-[var(--color-accent-blue)] px-2 py-1 text-xs">
              <span className="min-w-0 break-words text-[var(--color-surface-100)]">{chip.label}</span>
              <Button variant="ghost" size="sm" aria-label={t('assistant.chip.remove')} disabled={agentBusy} onClick={removeChip}>
                <X size={12} aria-hidden="true" />
              </Button>
            </div>
            {chip.kind === 'lesson' && <p className="text-xs text-[var(--color-surface-300)]">{t('assistant.lessonStance')}</p>}
          </div>
        )}
        <Textarea
          ref={promptRef}
          label={t('console.request')}
          value={agentPrompt}
          disabled={agentBusy}
          maxLength={4_000}
          onChange={(event) => {
            if (!agentBusy) setAgentPrompt(event.target.value);
          }}
          rows={4}
          placeholder={t('console.describeWhatYouWant')}
        />
        <p className="text-xs tabular-nums text-[var(--color-surface-400)]">
          {agentPrompt.length}
          {t('console.4000Characters')}
        </p>
        <section
          aria-label={t('console.agentContextPreview')}
          className="border-y border-[var(--color-surface-600)] py-2 text-xs text-[var(--color-surface-300)]"
        >
          <h3 className="font-medium text-[var(--color-surface-200)]">{t('console.contextPreview')}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>{t('console.modePromptLength', { agentMode: t(`assistant.mode.${agentMode}`), length: agentPrompt.trim().length })}</li>
            <li>{hasCurrentWorkspaceLink ? t('console.workspaceLinkedSavedWorkspace') : t('console.workspaceChooseZplcJson')}</li>
            <li>
              {agentMode === 'edit'
                ? agentEditFile
                  ? t('console.hostWillRereadSaved', { path: agentEditFile.path })
                  : t('console.editRequiresTheActive')
                : agentContextFile
                  ? t('console.hostWillRereadSaved', { path: agentContextFile.path })
                  : t('console.noProgramOpen')}
            </li>
            <li>{t('console.projectSummarySent')}</li>
            {agentMode === 'debug' && (
              <li>{t('console.boundedDiagnosticsHostTrace', { length: agentDiagnosticCount, length2: agentTraceCount })}</li>
            )}
            {chip && <li>{chip.label}</li>}
            {turnCount > 0 && <li>{t('assistant.followUp', { count: HISTORY_TURNS })}</li>}
            <li>{t('console.doNotPutSecrets')}</li>
          </ul>
        </section>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void sendAgentRequest();
            }}
            disabled={!agentCanSend}
          >
            <Send size={14} aria-hidden="true" />
            {t('console.sendRequest')}
          </Button>
          {turnCount > 0 && (
            <Button variant="secondary" size="sm" disabled={agentBusy} onClick={newConversation}>
              {t('assistant.newConversation')}
            </Button>
          )}
          {agentBusy && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void cancelAgentRequest();
              }}
              disabled={agentState === 'cancelling'}
            >
              <CircleStop size={14} aria-hidden="true" />
              {t('console.cancelRequest')}
            </Button>
          )}
        </div>
        <AgentStatus state={agentState} status={agentStatus} />
        {typeof agentState === 'object' && agentState.kind === 'response' && (
          <section className="space-y-2 border-t border-[var(--color-surface-600)] pt-2">
            {agentState.presentation.kind === 'answer' || agentState.presentation.kind === 'refused' ? (
              <AnswerText text={agentState.presentation.answer} />
            ) : (
              <p className="whitespace-pre-wrap text-[var(--color-surface-100)]">
                {agentState.presentation.kind === 'error'
                  ? providerErrorText(translator, agentState.presentation.code, agentState.presentation.retryAfter)
                  : t('console.providerResponseCouldNot')}
              </p>
            )}
            <p className="text-xs text-[var(--color-surface-400)]">{t('console.providerResponseNotEvidence2')}</p>
            {agentState.presentation.kind === 'refused' && (
              <div role="alert" className="text-xs text-[var(--color-accent-yellow)]">
                <p>
                  {agentState.presentation.reason === 'sensitive-field'
                    ? t('console.proposalRefusedSensitive', { path: agentState.presentation.path })
                    : t('console.proposalRefusedInvalid', { path: agentState.presentation.path })}
                </p>
                {agentState.presentation.violations.length > 0 && (
                  <ul className="list-disc pl-4">
                    {agentState.presentation.details
                      ? agentState.presentation.details.map((detail, index) => <li key={index}>{visualViolationText(detail)}</li>)
                      : agentState.presentation.violations.map((violation) => <li key={violation}>{violation}</li>)}
                  </ul>
                )}
              </div>
            )}
            {agentState.presentation.kind === 'answer' && agentState.presentation.proposals && (
              <AgentProposals proposals={agentState.presentation.proposals} />
            )}
            {agentState.presentation.kind === 'answer' && agentState.presentation.changes && (
              <ul aria-label={t('console.proposedFiles')} className="list-disc pl-4 text-xs text-[var(--color-surface-300)]">
                {agentState.presentation.changes.map((change) => (
                  <li key={change.path}>
                    {change.path} · {change.kind === 'create' ? t('console.newFile') : t('console.changedFile')}
                  </li>
                ))}
              </ul>
            )}
            {agentState.presentation.kind === 'answer' &&
              agentState.presentation.changes &&
              (agentProposalCurrent ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void reviewAgentProposal();
                  }}
                  disabled={workspaceTestBusy || !agentEditFile}
                >
                  <FileDiff size={14} aria-hidden="true" />
                  {t('console.reviewProposedChange')}
                </Button>
              ) : (
                <p role="status" className="text-xs text-[var(--color-accent-yellow)]">
                  {t('console.proposedChangeIsStale')}
                </p>
              ))}
          </section>
        )}
        <div className="border-t border-[var(--color-surface-600)] pt-2">
          <Button variant="secondary" size="sm" onClick={() => usePreferencesDocument.getState().show('assistant')}>
            {t('preferences.assistant.open')}
          </Button>
        </div>
      </section>
    </div>
  );
}
