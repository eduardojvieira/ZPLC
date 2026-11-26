import { describe, expect, test } from 'bun:test';

import { runConditions, type ConditionRun } from './capture';
import { captureRecord, conditionName, conditionsFor, manifestText, type Condition } from './manifest';

const conditions = conditionsFor({ id: 'dialog.palette', area: 'Dialogs', states: ['normal'], reachedBy: [] }).slice(0, 3);
const empty = { viewport: { width: 1440, height: 900 }, locale: 'en' as const, elements: [], textOutOfBox: [], scene: null };

describe('a capture run over the conditions of D-36 (UXV-003)', () => {
  test('UXV-003 one failing condition does not stop the run: the others are captured and the failure is recorded', async () => {
    const tried: string[] = [];
    const fake = async (condition: Condition): Promise<ConditionRun> => {
      tried.push(conditionName(condition));
      if (condition.theme === 'dark') throw new Error('Timed out waiting for the project workbench');
      const name = `dialog.palette--normal--${conditionName(condition)}`;
      return { captures: [captureRecord(name, 'dialog.palette', 'normal', condition, empty)], failed: [] };
    };
    const result = await runConditions(conditions, fake, () => undefined);
    expect(tried).toEqual(['1440x900-light-en', '1440x900-light-es', '1440x900-dark-en']);
    expect(result.captures.map((capture) => capture.condition)).toEqual(['1440x900-light-en', '1440x900-light-es']);
    expect(result.failedConditions).toEqual([{ condition: '1440x900-dark-en', error: 'Timed out waiting for the project workbench' }]);

    const after = await runConditions([conditions[2]!, conditions[0]!], fake, () => undefined);
    expect(after.captures.map((capture) => capture.condition)).toEqual(['1440x900-light-en']);

    const manifest = JSON.parse(manifestText(result.captures, [], result.failedConditions)) as { failedConditions: unknown };
    expect(manifest.failedConditions).toEqual(result.failedConditions);
  });
});
