import { useState } from 'react';
import { useT } from '../../i18n';
import { Button, ToggleGroup } from '../../ui';

interface Stage {
  title: string;
  body: string;
  checkpoint: string;
}

/** One stage at a time, with Back, Next and a list to jump to any stage; the stage keeps its expected checkpoint. */
export function GuideStages({ stages }: { stages: readonly Stage[] }) {
  const { t } = useT();
  const [at, setAt] = useState(0);
  const stage = stages[Math.min(at, stages.length - 1)];
  if (!stage) return null;
  return (
    <section aria-label={t('learn.lessonSteps')} className="border-b border-[var(--color-surface-700)] pb-3">
      <ToggleGroup
        label={t('u3Guide.stages')}
        value={String(at)}
        onValueChange={(value) => setAt(Number(value))}
        options={stages.map((_, index) => ({
          value: String(index),
          label: String(index + 1),
          ariaLabel: t('u3Guide.jump', { n: index + 1 }),
        }))}
      />
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
        <Button variant="secondary" size="sm" disabled={at >= stages.length - 1} onClick={() => setAt(at + 1)}>
          {t('u3Guide.next')}
        </Button>
      </div>
    </section>
  );
}
