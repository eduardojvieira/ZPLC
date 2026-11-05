/**
 * The `ld-try` block (LRN-041): a small simulation inside the text. The program is built by the Studio compiler and runs on
 * its own WebAssembly session (useLdTry.ts). The rungs show the live power flow, each input is a control that works by
 * pointer and keyboard, and each output is a lamp that also says its state in words.
 */
import { useRef } from 'react';
import { useT } from '../../i18n';
import { truthy } from '../../monitoring/elementStates';
import { createHold } from '../../runtime/faceplateState';
import { Button, SignalChip } from '../../ui';
import type { LdTryData } from '../readingTypes';
import { LdRungs } from './LdFigure';
import { TimingDiagram } from './TimingDiagram';
import { useLdRungs } from './useLdRungs';
import type { openTryLab } from '../../runtime/tryLab';
import { useLdTry } from './useLdTry';

type Hold = ReturnType<typeof createHold>;

export function LdTry({
  data,
  files,
  open,
}: {
  data: LdTryData;
  files: Record<string, string>;
  /** Only a test gives another lab; a page opens the one of the WebAssembly runtime. */
  open?: typeof openTryLab;
}) {
  const { t } = useT();
  const lab = useLdTry(files[data.src], data, open);
  const rungs = useLdRungs(files, data.src);
  const holds = useRef(new Map<string, Hold>());
  const hold = (name: string): Hold => {
    let found = holds.current.get(name);
    if (!found) holds.current.set(name, (found = createHold((down) => lab.setInput(name, down))));
    return found;
  };
  const operable = lab.status === 'running' || lab.status === 'paused';
  const title = data.caption ?? t('learnReading.try.defaultTitle');
  const failure = lab.failure;
  return (
    <section
      data-reading-block="ld-try"
      aria-label={t('learnReading.try.label', { title })}
      className="my-4 rounded border border-[var(--border-color)] p-3"
    >
      {failure && (
        <p role="alert" data-lab-failure={failure.reason} className="text-sm text-[var(--tone-danger-fg)]">
          {t(`learnReading.try.error.${failure.reason}` as const, { detail: failure.detail })}
        </p>
      )}
      {rungs.ok && (
        <div role="group" aria-label={t('learnReading.try.diagram')} className="mb-3">
          <LdRungs loaded={rungs} states={lab.states} />
        </div>
      )}
      {!failure && (
        <>
          <div role="group" aria-label={t('learnReading.try.controls')} className="flex flex-wrap items-center gap-2">
            <Button variant="primary" data-lab-control="run" disabled={lab.status !== 'idle' && lab.status !== 'paused'} onClick={lab.run}>
              {t('learnReading.try.run')}
            </Button>
            <Button data-lab-control="pause" disabled={lab.status !== 'running'} onClick={lab.pause}>
              {t('learnReading.try.pause')}
            </Button>
            <Button data-lab-control="reset" disabled={lab.status === 'idle' || lab.status === 'failed'} onClick={lab.reset}>
              {t('learnReading.try.reset')}
            </Button>
            <span role="status" data-lab-status={lab.status} className="text-sm text-[var(--text-secondary)]">
              {t(`learnReading.try.status.${lab.status}` as const)}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div role="group" aria-label={t('learnReading.try.inputs')} className="flex flex-wrap items-start gap-2">
              {data.inputs.map((input) =>
                input.kind === 'switch' ? (
                  <Button
                    key={input.name}
                    disabled={!operable}
                    aria-pressed={lab.inputs[input.name] === true}
                    data-lab-input={input.name}
                    onClick={() => lab.setInput(input.name, lab.inputs[input.name] !== true)}
                  >
                    {t('learnReading.try.switchLabel', { name: input.name })}:{' '}
                    {t(lab.inputs[input.name] === true ? 'learnReading.try.switchOn' : 'learnReading.try.switchOff')}
                  </Button>
                ) : (
                  <Button
                    key={input.name}
                    disabled={!operable}
                    data-lab-input={input.name}
                    data-pressed={lab.inputs[input.name] === true}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      hold(input.name).press();
                    }}
                    onPointerUp={() => hold(input.name).release()}
                    onPointerCancel={() => hold(input.name).release()}
                    onLostPointerCapture={() => hold(input.name).release()}
                    onKeyDown={(event) => {
                      if (event.key !== ' ' && event.key !== 'Enter') return;
                      event.preventDefault();
                      hold(input.name).press();
                    }}
                    onKeyUp={(event) => {
                      if (event.key === ' ' || event.key === 'Enter') hold(input.name).release();
                    }}
                    onBlur={() => hold(input.name).release()}
                  >
                    {t('learnReading.try.pushLabel', { name: input.name })}
                  </Button>
                ),
              )}
            </div>
            <ul aria-label={t('learnReading.try.outputs')} className="m-0 flex list-none flex-wrap items-start gap-2 p-0">
              {data.outputs.map((name) => {
                const on = truthy(lab.read(name));
                const state = t(
                  on === undefined ? 'learnReading.try.lampUnknown' : on ? 'learnReading.try.lampOn' : 'learnReading.try.lampOff',
                );
                return (
                  <li key={name} data-lamp={name} data-state={on === undefined ? 'unknown' : on ? 'on' : 'off'}>
                    <SignalChip
                      tone={on === undefined ? 'unknown' : on ? 'true' : 'false'}
                      detail={t('learnReading.try.lamp', { name, state })}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          {lab.timing && <TimingDiagram data={lab.timing} />}
        </>
      )}
      {data.caption && <p className="mt-2 text-sm text-[var(--text-secondary)]">{data.caption}</p>}
    </section>
  );
}
