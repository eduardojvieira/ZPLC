import { CircleStop, FileDiff, Send } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button, Checkbox, TextField, Textarea } from '../../ui';
import { useT } from '../../i18n';
import { AgentProposals } from '../agent/AgentProposals';
import { AgentStatus, type AgentState } from '../ConsoleReviewPanels';
import type { AiProviderMode, AiProviderStatusPresentation } from '../aiProviderPresentation';

export interface AgentConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
}

export interface AgentTabProps {
  aiProviderAvailable: boolean;
  agentMode: AiProviderMode;
  setAgentMode: (mode: AiProviderMode) => void;
  agentPrompt: string;
  setAgentPrompt: (prompt: string) => void;
  agentState: AgentState;
  setAgentState: (state: AgentState) => void;
  agentStatus: AiProviderStatusPresentation;
  agentConfig: AgentConfig;
  setAgentConfig: Dispatch<SetStateAction<AgentConfig>>;
  agentKey: string;
  setAgentKey: (key: string) => void;
  agentSettingsBusy: boolean;
  agentSettingsMessage: string | null;
  agentSettingsOpen: boolean;
  setAgentSettingsOpen: (open: boolean) => void;
  agentBusy: boolean;
  agentCanSend: boolean;
  agentProposalCurrent: boolean;
  agentEditFile: { path: string } | undefined;
  agentContextFile: { path: string } | undefined;
  agentDiagnosticCount: number;
  agentTraceCount: number;
  hasCurrentWorkspaceLink: boolean;
  workspaceTestBusy: boolean;
  refreshAiProvider: () => Promise<void>;
  sendAgentRequest: () => Promise<void>;
  cancelAgentRequest: () => Promise<void>;
  reviewAgentProposal: () => Promise<void>;
  saveAgentConfig: () => Promise<void>;
  storeAgentKey: () => Promise<void>;
  clearAgentKey: () => Promise<void>;
}

export function AgentTab({
  aiProviderAvailable,
  agentMode,
  setAgentMode,
  agentPrompt,
  setAgentPrompt,
  agentState,
  setAgentState,
  agentStatus,
  agentConfig,
  setAgentConfig,
  agentKey,
  setAgentKey,
  agentSettingsBusy,
  agentSettingsMessage,
  agentSettingsOpen,
  setAgentSettingsOpen,
  agentBusy,
  agentCanSend,
  agentProposalCurrent,
  agentEditFile,
  agentContextFile,
  agentDiagnosticCount,
  agentTraceCount,
  hasCurrentWorkspaceLink,
  workspaceTestBusy,
  refreshAiProvider,
  sendAgentRequest,
  cancelAgentRequest,
  reviewAgentProposal,
  saveAgentConfig,
  storeAgentKey,
  clearAgentKey,
}: AgentTabProps) {
  const { t } = useT();
  const aiProvider = aiProviderAvailable;
  return (
    <div className="min-h-full p-3 font-sans text-sm text-[var(--color-surface-200)]">
      <section
        aria-label={t('console.optionalAgent')}
        className="max-w-3xl space-y-3 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-surface-600)] pb-2">
          <div>
            <h2 className="font-medium text-[var(--color-surface-100)]">{t('console.tab.agent')}</h2>
            <p className="mt-1 text-xs text-[var(--color-surface-400)]">{t('console.providerResponseNotEvidence')}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!agentBusy && !agentSettingsBusy) void refreshAiProvider();
            }}
            disabled={agentState === 'loading' || agentBusy || agentSettingsBusy}
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
              className={
                `border px-2.5 py-1 text-xs font-medium capitalize disabled:cursor-not-allowed ` +
                `disabled:opacity-60 ${
                  agentMode === mode
                    ? 'border-[var(--color-accent-blue)] ' + 'text-[var(--color-surface-100)]'
                    : 'border-[var(--color-surface-600)] text-[var(--color-surface-300)] ' + 'hover:bg-[var(--color-surface-700)]'
                }`
              }
            >
              {mode}
            </Button>
          ))}
        </div>
        <Textarea
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
            <li>{t('console.modePromptLength', { agentMode, length: agentPrompt.trim().length })}</li>
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
            <p className="whitespace-pre-wrap text-[var(--color-surface-100)]">
              {agentState.presentation.kind === 'answer' || agentState.presentation.kind === 'refused'
                ? agentState.presentation.answer
                : agentState.presentation.kind === 'error'
                  ? t('console.providerRequestFailed', { code: agentState.presentation.code })
                  : t('console.providerResponseCouldNot')}
            </p>
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
                    {agentState.presentation.violations.map((violation) => (
                      <li key={violation}>{violation}</li>
                    ))}
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
        <details
          open={agentSettingsOpen}
          onToggle={(event) => {
            if (agentBusy) {
              event.currentTarget.open = agentSettingsOpen;
              return;
            }
            setAgentSettingsOpen(event.currentTarget.open);
          }}
          className="border-t border-[var(--color-surface-600)] pt-2"
        >
          <summary aria-disabled={agentBusy} className="cursor-pointer text-xs font-medium text-[var(--color-surface-200)]">
            {t('console.providerSettings')}
          </summary>
          <fieldset disabled={agentBusy || agentSettingsBusy} className="mt-2 disabled:opacity-60">
            <div className="grid gap-2 sm:grid-cols-2">
              <Checkbox
                checked={agentConfig.enabled}
                onChange={(event) => setAgentConfig((config) => ({ ...config, enabled: event.target.checked }))}
                label={t('console.enabled2')}
              />
              <TextField
                value={agentConfig.endpoint}
                onChange={(event) => setAgentConfig((config) => ({ ...config, endpoint: event.target.value }))}
                className="mt-1 block w-full"
                label={t('console.endpoint')}
              />
              <TextField
                value={agentConfig.model}
                onChange={(event) => setAgentConfig((config) => ({ ...config, model: event.target.value }))}
                className="mt-1 block w-full"
                label={t('console.model')}
              />
              <TextField
                type="password"
                value={agentKey}
                onChange={(event) => setAgentKey(event.target.value)}
                autoComplete="new-password"
                className="mt-1 block w-full"
                label={t('console.apiKey')}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void saveAgentConfig();
                }}
                disabled={!aiProvider}
              >
                {t('configEditor.save')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void storeAgentKey();
                }}
                disabled={!aiProvider || !agentKey}
              >
                {t('console.storeKey')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void clearAgentKey();
                }}
                disabled={!aiProvider}
              >
                {t('console.clearKey')}
              </Button>
            </div>
          </fieldset>
          {agentSettingsMessage && (
            <p role="status" className="mt-2 text-xs text-[var(--color-surface-300)]">
              {agentSettingsMessage}
            </p>
          )}
        </details>
      </section>
    </div>
  );
}
