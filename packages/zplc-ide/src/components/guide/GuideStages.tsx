import { useState } from 'react';
import { useT } from '../../i18n';
import { Button } from '../../ui';

interface Stage {
  title: string;
  body: string;
  checkpoint: string;
}

/**
 * One stage at a time, with Back, Next and a list to jump to any stage; the stage keeps its expected checkpoint.
 * Reflect, the last stage, is listed but locked until `reflectOpen`; the locked item stays focusable so the reason can be read.
 */
export function GuideStages({ stages, reflectOpen }: { stages: readonly Stage[]; reflectOpen: boolean }) {
  const { t } = useT();
  const [at, setAt] = useState(0);
  const lockedAt = reflectOpen ? -1 : stages.length - 1;
  const lastOpen = lockedAt < 0 ? stages.length - 1 : lockedAt - 1;
  const stage = stages[Math.min(at, lastOpen)];
  if (!stage) return null;
  return (
    <section aria-label={t('learn.lessonSteps')} className="border-b border-[var(--color-surface-700)] pb-3">
      <div role="group" aria-label={t('u3Guide.stages')} className="ui-toggle-group">
        {stages.map((_, index) => (
          <Button
            key={index}
            size="sm"
            variant={index === at ? 'primary' : 'secondary'}
            aria-pressed={index === at}
            aria-label={t('u3Guide.jump', { n: index + 1 })}
            aria-disabled={index === lockedAt ? true : undefined}
            aria-describedby={index === lockedAt ? 'guide-stage-locked' : undefined}
            onClick={() => index !== lockedAt && setAt(index)}
          >
            {index === lockedAt ? `${index + 1} · ${t('u3Guide.locked')}` : String(index + 1)}
          </Button>
        ))}
      </div>
      {lockedAt >= 0 && (
        <p id="guide-stage-locked" data-guide-stage-locked className="mt-1 text-xs text-[var(--color-surface-400)]">
          {t('u3Guide.reflectLocked')}
        </p>
      )}
      <div data-guide-stage className="mt-3">
        <p className="text-xs text-[var(--color-surface-400)]">{t('u3Guide.stage', { n: at + 1, total: stages.length })}</p>
        <h3 className="font-medium text-[var(--color-surface-100)]">{stage.title}</h3>
        <p className="mt-1 leading-5 text-[var(--color-surface-300)]">{stage.body}</p>
        <details key={at} className="mt-2 text-xs text-[var(--color-surface-300)]">
          <summary
            aria-label={t('learn.showExpectedCheckpointFor', { stage: stage.title })}
            className="cursor-pointer select-none font-medium text-[var(--color-accent-blue)]"
          >
            {t('learn.showExpectedCheckpoint')}
          </summary>
          <p className="mt-1 leading-5">{stage.checkpoint}</p>
        </details>
      </div>
      <div className="mt-2 flex gap-2">
        <Button variant="secondary" size="sm" disabled={at === 0} onClick={() => setAt(at - 1)}>
          {t('u3Guide.back')}
        </Button>
        <Button variant="secondary" size="sm" disabled={at >= lastOpen} onClick={() => setAt(at + 1)}>
          {t('u3Guide.next')}
        </Button>
      </div>
    </section>
  );
}
