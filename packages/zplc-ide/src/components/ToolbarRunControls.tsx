/**
 * The connect, deploy, run, pause, step, stop and reset controls of the toolbar (IDE-014: split out of Toolbar.tsx). The target is
 * the selector's (FLW-007). Run, Step, Stop and Reset are always there: Run prepares what is missing (FLW-001), and on a board it
 * offers the missing step instead (FLW-003). Connect and Deploy are shown for a board only (FLW-007, FLW-008).
 */

import { Play, Square, Upload, Usb, Loader2, Pause, SkipForward, RotateCcw, Unplug } from 'lucide-react';
import { useT } from '../i18n';
import { withShortcut } from '../commands/shortcutLabels';
import { EXECUTION_MODE, type ExecutionMode } from './runtimeArtifactSelection';
import { Button } from '../ui';

export function RunControls({
  executionMode,
  isConnected,
  isConnecting,
  isUploading,
  controlsBusy,
  hasCurrentCompileResult,
  isRunning,
  isPaused,
  isStopped,
  connectionButtonRef,
  executionButtonRef,
  onConnect,
  onUpload,
  onStart,
  onPause,
  onResume,
  onStep,
  onStop,
  onReset,
}: {
  executionMode: ExecutionMode;
  isConnected: boolean;
  isConnecting: boolean;
  isUploading: boolean;
  controlsBusy: boolean;
  hasCurrentCompileResult: boolean;
  isRunning: boolean;
  isPaused: boolean;
  /** Not running and not paused: idle, or a simulation whose session has not started. */
  isStopped: boolean;
  connectionButtonRef: React.RefObject<HTMLButtonElement | null>;
  executionButtonRef: React.RefObject<HTMLButtonElement | null>;
  onConnect: () => Promise<void>;
  onUpload: () => Promise<void>;
  onStart: (keyboardInitiated: boolean) => Promise<void>;
  onPause: (keyboardInitiated: boolean) => Promise<void>;
  onResume: (keyboardInitiated: boolean) => Promise<void>;
  onStep: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const { t } = useT();
  return (
    <>
      {/* Connection / Execution Controls */}
      <div className="flex items-center gap-1">
        {/* Connect/Disconnect: a board only */}
        {executionMode === EXECUTION_MODE.HARDWARE && (
          <Button
            variant="bare"
            ref={connectionButtonRef}
            type="button"
            onClick={() => {
              void onConnect();
            }}
            disabled={controlsBusy}
            className={`focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              isConnected
                ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-200)] hover:brightness-110 hover:text-[var(--color-on-accent)]'
                : 'bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-bg-hover)] text-[var(--button-primary-fg)]'
            } disabled:opacity-50`}
            aria-label={isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
            data-command={isConnected ? 'online.disconnect' : 'online.connect'}
            tooltip={isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
          >
            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : isConnected ? <Unplug size={14} /> : <Usb size={14} />}
            <span className="hidden md:inline">{isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}</span>
          </Button>
        )}

        {/* Upload - only for hardware mode when connected */}
        {executionMode === 'hardware' && isConnected && (
          <Button
            variant="bare"
            type="button"
            onClick={() => {
              void onUpload();
            }}
            disabled={!hasCurrentCompileResult || controlsBusy}
            className={
              'focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] ' +
              'hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors ' +
              'disabled:opacity-40'
            }
            aria-label={t('toolbar.deploy.label')}
            data-command="online.deploy"
            tooltip={t('toolbar.deploy.title')}
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span className="hidden md:inline">{t('toolbar.deploy.text')}</span>
          </Button>
        )}

        {/* Execution controls: always shown, so that Run is one press from any state (FLW-001) */}
        <>
          {/* Run/Resume or Pause based on state */}
          {isRunning ? (
            <Button
              variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => {
                void onPause(event.detail === 0);
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-yellow)] ' +
                'hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors'
              }
              aria-label={withShortcut(t('toolbar.pause.label'), 'debug.pause')}
              data-command="debug.pause"
              tooltip={withShortcut(t('toolbar.pause.label'), 'debug.pause')}
            >
              <Pause size={14} />
              <span className="hidden sm:inline">{t('toolbar.pause.text')}</span>
            </Button>
          ) : isPaused ? (
            <Button
              variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => {
                void onResume(event.detail === 0);
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-green)] ' +
                'hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors'
              }
              aria-label={withShortcut(t('toolbar.resume.label'), 'debug.run')}
              data-command="debug.run"
              tooltip={withShortcut(t('toolbar.resume.label'), 'debug.run')}
            >
              <Play size={14} />
              <span className="hidden sm:inline">{t('toolbar.resume.text')}</span>
            </Button>
          ) : (
            <Button
              variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => {
                void onStart(event.detail === 0);
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-green)] ' +
                'hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors disabled:opacity-40'
              }
              aria-label={withShortcut(t('toolbar.run.label'), 'debug.run')}
              data-command="debug.run"
              tooltip={withShortcut(t('toolbar.run.label'), 'debug.run')}
            >
              <Play size={14} />
              <span className="hidden sm:inline">{t('toolbar.run.text')}</span>
            </Button>
          )}

          {/* Step - when paused or stopped; on a board only with a session */}
          {(isPaused || isStopped) && (executionMode === EXECUTION_MODE.SIMULATE || isConnected) && (
            <Button
              variant="bare"
              type="button"
              onClick={() => {
                void onStep();
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] ' +
                'hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors'
              }
              aria-label={withShortcut(t('toolbar.step.label'), 'debug.step')}
              data-command="debug.step"
              tooltip={withShortcut(t('toolbar.step.label'), 'debug.step')}
            >
              <SkipForward size={14} />
            </Button>
          )}

          {/* Stop - when running or paused */}
          {(isRunning || isPaused) && (
            <Button
              variant="bare"
              type="button"
              onClick={() => {
                void onStop();
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-red)] hover:brightness-110 ' +
                'text-[var(--color-on-accent)] text-xs font-medium transition-colors'
              }
              aria-label={withShortcut(t('toolbar.stop.label'), 'debug.stop')}
              data-command="debug.stop"
              tooltip={withShortcut(t('toolbar.stop.label'), 'debug.stop')}
            >
              <Square size={14} />
            </Button>
          )}

          {/* Reset - with a session */}
          {isConnected && (
            <Button
              variant="bare"
              type="button"
              onClick={() => {
                void onReset();
              }}
              disabled={controlsBusy}
              className={
                'focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] ' +
                'hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors'
              }
              aria-label={withShortcut(t('toolbar.reset.label'), 'debug.reset')}
              data-command="debug.reset"
              tooltip={withShortcut(t('toolbar.reset.title'), 'debug.reset')}
            >
              <RotateCcw size={14} />
            </Button>
          )}
        </>
      </div>
    </>
  );
}
