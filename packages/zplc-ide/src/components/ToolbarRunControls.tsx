/**
 * The mode toggle and the connect, deploy, run, pause, step, stop and reset controls of the toolbar (IDE-014: split out of Toolbar.tsx).
 */

import { Play, Square, Upload, Usb, Loader2, Pause, SkipForward, Cpu, RotateCcw, Radio, Unplug, Zap } from 'lucide-react';
import { useT } from '../i18n';
import { withShortcut } from '../commands/shortcutLabels';
import { canRunCurrentProgram, type ProgramLoadState } from './debugSessionState';
import { EXECUTION_MODE, type ExecutionMode } from './runtimeArtifactSelection';
import { Button } from '../ui';

export function RunControls({ executionMode, isConnected, isConnecting, isUploading, controlsBusy, hasCurrentCompileResult, programLoadState, isRunning, isPaused, isIdle, mpeekEnabled, toggleMpeek, connectionButtonRef, executionButtonRef, onExecutionModeChange, onConnect, onUpload, onStart, onPause, onResume, onStep, onStop, onReset }: {
  executionMode: ExecutionMode;
  isConnected: boolean;
  isConnecting: boolean;
  isUploading: boolean;
  controlsBusy: boolean;
  hasCurrentCompileResult: boolean;
  programLoadState: ProgramLoadState;
  isRunning: boolean;
  isPaused: boolean;
  isIdle: boolean;
  mpeekEnabled: boolean;
  toggleMpeek: () => void;
  connectionButtonRef: React.RefObject<HTMLButtonElement | null>;
  executionButtonRef: React.RefObject<HTMLButtonElement | null>;
  onExecutionModeChange: (mode: ExecutionMode) => Promise<void>;
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
    {/* Mode Toggle */}
    <div role="group" aria-label={t('toolbar.mode.label')} className="flex items-center bg-[var(--color-surface-700)] rounded overflow-hidden">
      <Button variant="bare"
          type="button"
          onClick={() => { void onExecutionModeChange(EXECUTION_MODE.SIMULATE); }}
          disabled={controlsBusy}
         className={`focus-ring flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === EXECUTION_MODE.SIMULATE
          ? 'bg-[var(--color-accent-blue)] text-[var(--color-on-accent)]'
          : 'text-[var(--color-surface-300)] hover:bg-[var(--menu-item-bg-active)]'
          } disabled:opacity-50`}
        aria-label={t('toolbar.simulation.label')}
        aria-pressed={executionMode === EXECUTION_MODE.SIMULATE}
        tooltip={t('toolbar.simulation.title')}
      >
        <Cpu size={14} />
        <span className="hidden sm:inline">{t('toolbar.simulation.text')}</span>
      </Button>
      <Button variant="bare"
          type="button"
          onClick={() => { void onExecutionModeChange(EXECUTION_MODE.HARDWARE); }}
          disabled={controlsBusy}
         className={`focus-ring flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${executionMode === EXECUTION_MODE.HARDWARE
          ? 'bg-[var(--color-accent-blue)] text-[var(--color-on-accent)]'
          : 'text-[var(--color-surface-300)] hover:bg-[var(--menu-item-bg-active)]'
          } disabled:opacity-50`}
        aria-label={t('toolbar.hardware.label')}
        aria-pressed={executionMode === EXECUTION_MODE.HARDWARE}
        tooltip={t('toolbar.hardware.title')}
      >
        <Radio size={14} />
        <span className="hidden sm:inline">{t('toolbar.hardware.text')}</span>
      </Button>
    </div>

    {/* Separator */}
    <div className="w-px h-6 bg-[var(--color-surface-600)]" />

    {/* Connection / Execution Controls */}
    <div className="flex items-center gap-1">
      {/* Connect/Disconnect */}
      <Button variant="bare"
        ref={connectionButtonRef}
        type="button"
        onClick={() => { void onConnect(); }}
        disabled={controlsBusy}
        className={`focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${isConnected
          ? 'bg-[var(--color-surface-700)] text-[var(--color-surface-200)] hover:brightness-110 hover:text-[var(--color-on-accent)]'
          : executionMode === 'simulate'
            ? 'bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-bg-hover)] text-[var(--button-primary-fg)]'
            : 'bg-[var(--button-primary-bg)] hover:bg-[var(--button-primary-bg-hover)] text-[var(--button-primary-fg)]'
        } disabled:opacity-50`}
        aria-label={isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
        tooltip={isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}
      >
        {isConnecting ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isConnected ? (
          <Unplug size={14} />
        ) : executionMode === 'simulate' ? (
          <Cpu size={14} />
        ) : (
          <Usb size={14} />
        )}
        <span className="hidden md:inline">{isConnected ? t('toolbar.disconnect') : t('toolbar.connect')}</span>
      </Button>

      {/* Upload - only for hardware mode when connected */}
      {executionMode === 'hardware' && isConnected && (
        <Button variant="bare"
          type="button"
          onClick={() => { void onUpload(); }}
          disabled={!hasCurrentCompileResult || controlsBusy}
          className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors disabled:opacity-40"
          aria-label={t('toolbar.deploy.label')}
          tooltip={t('toolbar.deploy.title')}
        >
          {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          <span className="hidden md:inline">{t('toolbar.deploy.text')}</span>
        </Button>
      )}

      {/* Live Values (mpeek) toggle */}
      {isConnected && (
        <Button variant="bare"
          type="button"
          onClick={toggleMpeek}
          disabled={controlsBusy}
          className={`focus-ring flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            mpeekEnabled
              ? 'bg-[var(--color-accent-yellow)] hover:brightness-110 text-[var(--color-on-accent)]'
              : 'bg-[var(--color-surface-700)] hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-400)]'
          }`}
          aria-label={mpeekEnabled ? t('toolbar.live.disable') : t('toolbar.live.enable')}
          tooltip={mpeekEnabled ? t('toolbar.live.enabledTitle') : t('toolbar.live.disabledTitle')}
        >
          <Zap size={13} />
          <span className="hidden lg:inline">{t('toolbar.live.text')}</span>
        </Button>
      )}

      {/* Separator when connected */}
      {isConnected && <div className="w-px h-5 bg-[var(--color-surface-600)] mx-0.5" />}

      {/* Execution Controls - only when connected */}
      {isConnected && (
        <>
          {/* Run/Resume or Pause based on state */}
          {isRunning ? (
            <Button variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => { void onPause(event.detail === 0); }}
              disabled={controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-yellow)] hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors"
              aria-label={withShortcut(t('toolbar.pause.label'), 'debug.pause')}
              tooltip={withShortcut(t('toolbar.pause.label'), 'debug.pause')}
            >
              <Pause size={14} />
              <span className="hidden sm:inline">{t('toolbar.pause.text')}</span>
            </Button>
          ) : isPaused ? (
            <Button variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => { void onResume(event.detail === 0); }}
              disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-green)] hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors"
              aria-label={withShortcut(t('toolbar.resume.label'), 'debug.run')}
              tooltip={withShortcut(t('toolbar.resume.label'), 'debug.run')}
            >
              <Play size={14} />
              <span className="hidden sm:inline">{t('toolbar.resume.text')}</span>
            </Button>
          ) : (
            <Button variant="bare"
              type="button"
              ref={executionButtonRef}
              onClick={(event) => { void onStart(event.detail === 0); }}
              disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-green)] hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors disabled:opacity-40"
              aria-label={withShortcut(t('toolbar.run.label'), 'debug.run')}
              tooltip={withShortcut(t('toolbar.run.label'), 'debug.run')}
            >
              <Play size={14} />
              <span className="hidden sm:inline">{t('toolbar.run.text')}</span>
            </Button>
          )}

          {/* Step - only when paused or idle */}
          {(isPaused || isIdle) && (
            <Button variant="bare"
              type="button"
              onClick={() => { void onStep(); }}
              disabled={!canRunCurrentProgram(executionMode, hasCurrentCompileResult, programLoadState) || controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
              aria-label={withShortcut(t('toolbar.step.label'), 'debug.step')}
              tooltip={withShortcut(t('toolbar.step.label'), 'debug.step')}
            >
              <SkipForward size={14} />
            </Button>
          )}

          {/* Stop - when running or paused */}
          {(isRunning || isPaused) && (
            <Button variant="bare"
              type="button"
              onClick={() => { void onStop(); }}
              disabled={controlsBusy}
              className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--color-accent-red)] hover:brightness-110 text-[var(--color-on-accent)] text-xs font-medium transition-colors"
              aria-label={withShortcut(t('toolbar.stop.label'), 'debug.stop')}
              tooltip={withShortcut(t('toolbar.stop.label'), 'debug.stop')}
            >
              <Square size={14} />
            </Button>
          )}

          {/* Reset */}
          <Button variant="bare"
            type="button"
            onClick={() => { void onReset(); }}
            disabled={controlsBusy}
            className="focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded bg-[var(--color-surface-700)] hover:bg-[var(--menu-item-bg-active)] text-[var(--color-surface-200)] text-xs font-medium transition-colors"
            aria-label={withShortcut(t('toolbar.reset.label'), 'debug.reset')}
            tooltip={withShortcut(t('toolbar.reset.title'), 'debug.reset')}
          >
            <RotateCcw size={14} />
          </Button>
        </>
      )}
    </div>
    </>
  );
}
