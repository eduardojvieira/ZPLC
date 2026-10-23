import type { Translator } from '../i18n';
import type { NavigatorWords } from './navigatorGroups';

/** The phrases of the navigator in the language of a translator. */
export function navigatorWords({ t }: Pick<Translator, 't'>): NavigatorWords {
  return {
    kind: {
      STRUCT: t('navigator.kind.STRUCT'),
      ENUM: t('navigator.kind.ENUM'),
      TYPE: t('navigator.kind.TYPE'),
      INTERFACE: t('navigator.kind.INTERFACE'),
    },
    constant: t('navigator.constant'),
    noTasks: t('navigator.tasks.none'),
    task: ({ trigger: raw, intervalMs, priority }) => {
      // the trigger is a word of the project file: said in the language of the interface when it is one of the three
      const trigger = raw === 'cyclic' || raw === 'event' || raw === 'freewheeling' ? t(`statusText.trigger.${raw}`) : raw;
      return intervalMs === undefined
        ? t('navigator.task.other', { trigger, priority })
        : t('navigator.task.cyclic', { trigger, interval: intervalMs, priority });
    },
    inputs: (count) => t('navigator.io.inputs', { count }),
    outputs: (count) => t('navigator.io.outputs', { count }),
    tags: (count) => t('navigator.tags', { count }),
    target: t('navigator.device.target'),
    network: t('navigator.device.network'),
    on: t('navigator.on'),
    off: t('navigator.off'),
  };
}
