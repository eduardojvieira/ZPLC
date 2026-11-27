/**
 * The MCP connection panel, a section of Preferences (AIX-007, AI-11): choose Claude Code, Cursor or VS Code, read the exact file
 * and text that would be written, confirm, and run the local self-check. The window sends only a client name and the text it was
 * shown; the main process picks the folder and the path and writes nothing else (`electron/mcpConfigIpc.ts`).
 */
import { useCallback, useEffect, useState } from 'react';
import { Button, ToggleGroup } from '../../ui';
import { useT } from '../../i18n';

type Client = 'claude-code' | 'cursor' | 'vscode';
const CLIENTS: readonly Client[] = ['claude-code', 'cursor', 'vscode'];
type Preview = { path: string; exists: boolean; text: string; copy: string };
type Answer<T> = ({ ok: true } & T) | { ok: false; message: string };

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const str = (value: unknown): value is string => typeof value === 'string';

function asPreview(value: unknown): Answer<Preview> | null {
  const v = record(value);
  if (v?.ok === false && str(v.message)) return { ok: false, message: v.message };
  if (v?.ok === true && str(v.path) && str(v.text) && str(v.copy) && typeof v.exists === 'boolean')
    return { ok: true, path: v.path, text: v.text, copy: v.copy, exists: v.exists };
  return null;
}

interface Report {
  toolCount: number | null;
  problems: Array<{ cause: string; nextStep: string }>;
}
function asReport(value: unknown): Answer<{ ready: boolean; report: Report }> | null {
  const v = record(value);
  if (v?.ok === false && str(v.message)) return { ok: false, message: v.message };
  const report = record(v?.report);
  if (v?.ok !== true || typeof v.ready !== 'boolean' || !report) return null;
  const problems = Array.isArray(report.problems)
    ? report.problems.flatMap((item) => {
        const p = record(item);
        return p && str(p.cause) ? [{ cause: p.cause, nextStep: str(p.nextStep) ? p.nextStep : '' }] : [];
      })
    : [];
  return { ok: true, ready: v.ready, report: { toolCount: typeof report.toolCount === 'number' ? report.toolCount : null, problems } };
}

export function McpConnectionSettings() {
  const { t } = useT();
  const bridge = window.electronAPI?.mcpConnection;
  const [client, setClient] = useState<Client>('claude-code');
  const [preview, setPreview] = useState<Answer<Preview> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [check, setCheck] = useState<Answer<{ ready: boolean; report: Report }> | 'running' | null>(null);

  const load = useCallback(
    async (which: Client) => {
      if (!bridge) return;
      try {
        setPreview(asPreview(await bridge.preview(which)) ?? { ok: false, message: t('mcp.noProject') });
      } catch {
        setPreview({ ok: false, message: t('mcp.noProject') });
      }
    },
    [bridge, t],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(client), 0);
    return () => window.clearTimeout(timer);
  }, [client, load]);

  if (!bridge)
    return (
      <section data-mcp-connection className="mb-6 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{t('mcp.heading')}</h2>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('mcp.unavailable')}</p>
      </section>
    );

  const ready = preview?.ok === true ? preview : null;
  const choose = (value: string) => {
    setClient(value as Client);
    setPreview(null);
    setConfirming(false);
    setNote(null);
  };
  const write = async () => {
    if (!ready) return;
    setConfirming(false);
    try {
      const answer = record(await bridge.write({ client, expected: ready.text }));
      setNote(
        answer?.ok === true && str(answer.path)
          ? t('mcp.written', { path: answer.path })
          : t('mcp.refused', { message: str(answer?.message) ? answer.message : t('mcp.noProject') }),
      );
      void load(client);
    } catch {
      setNote(t('mcp.refused', { message: t('mcp.noProject') }));
    }
  };
  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(ready.copy);
      setNote(t('mcp.copied'));
    } catch {
      setNote(null);
    }
  };
  const runCheck = async () => {
    setCheck('running');
    try {
      setCheck(asReport(await bridge.selfCheck()) ?? { ok: false, message: t('mcp.noProject') });
    } catch {
      setCheck({ ok: false, message: t('mcp.noProject') });
    }
  };

  return (
    <section
      id="mcp-connection"
      aria-labelledby="mcp-connection-heading"
      data-mcp-connection
      className="mb-6 border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] p-4"
    >
      <h2 id="mcp-connection-heading" className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
        {t('mcp.heading')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('mcp.intro')}</p>
      <ToggleGroup
        className="mt-3"
        label={t('mcp.client')}
        value={client}
        onValueChange={choose}
        options={CLIENTS.map((value) => ({ value, label: t(`mcp.client.${value}`) }))}
      />
      {preview?.ok === false && (
        <p role="status" className="mt-3 text-xs text-[var(--color-status-stopped)]">
          {t('mcp.refused', { message: preview.message })}
        </p>
      )}
      {ready && (
        <div className="mt-3">
          <p className="text-xs text-[var(--text-secondary)]">{t('mcp.file', { path: ready.path })}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{ready.exists ? t('mcp.fileExists') : t('mcp.fileNew')}</p>
          <pre
            tabIndex={0}
            aria-label={t('mcp.preview')}
            className="mt-2 max-h-64 overflow-auto border border-[var(--color-surface-600)] p-2 text-xs"
          >
            {ready.text}
          </pre>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!ready} onClick={() => setConfirming(true)}>
          {t('mcp.write')}
        </Button>
        <Button variant="secondary" size="sm" disabled={!ready} onClick={() => void copy()}>
          {t('mcp.copy')}
        </Button>
      </div>
      {confirming && ready && (
        <div role="group" aria-label={t('mcp.confirmAsk', { path: ready.path })} className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs">{t('mcp.confirmAsk', { path: ready.path })}</span>
          <Button variant="primary" size="sm" onClick={() => void write()}>
            {t('mcp.confirm')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
            {t('mcp.cancel')}
          </Button>
        </div>
      )}
      <p role="status" className="mt-2 text-xs">
        {note}
      </p>
      <div className="mt-3">
        <Button variant="secondary" size="sm" disabled={check === 'running'} onClick={() => void runCheck()}>
          {t('mcp.selfCheck')}
        </Button>
        <div role="status" className="mt-2 text-xs">
          {check === 'running' && t('mcp.selfCheck.running')}
          {check && check !== 'running' && check.ok === false && t('mcp.selfCheck.unavailable', { message: check.message })}
          {check && check !== 'running' && check.ok && check.ready && t('mcp.selfCheck.ready', { count: check.report.toolCount ?? 0 })}
          {check && check !== 'running' && check.ok && !check.ready && (
            <>
              <p>{t('mcp.selfCheck.notReady')}</p>
              <ul className="list-disc pl-4">
                {check.report.problems.map((problem) => (
                  <li key={problem.cause}>
                    <span>{problem.cause}</span>
                    {problem.nextStep && (
                      <>
                        {' '}
                        <span>{problem.nextStep}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
