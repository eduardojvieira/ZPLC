import { afterEach, describe, expect, it } from 'bun:test';
import { bindCommands } from '../commands/bus';
import { isAllowedAiProviderRequest } from '../../electron/security';
import { diagnosticIntent, failureIntent, lessonIntent, openAssistantWith, selectionIntent, useAssistantEntry } from './useAssistantEntry';

// AIX-003, AI-18: four places open the Assistant with their context attached, through the one request the provider accepts.
const base = { workspaceId: '0f2ce877-e0d6-43ca-89a7-df17a4927f51', prompt: 'x' };
const accepted = (mode: string, fields: object) => isAllowedAiProviderRequest({ ...base, mode, ...fields });

afterEach(() => useAssistantEntry.getState().take());

describe('the entry points of the Assistant (AIX-003)', () => {
  it('AIX-003 a problem opens the Assistant in debug mode with the diagnostic, its message and its place', () => {
    const intent = diagnosticIntent({ message: 'Undeclared variable Run', file: 'src/Main.st', line: 14, column: 3, code: 'E_UNDECLARED' });
    expect(intent.mode).toBe('debug');
    expect(intent.context.kind).toBe('diagnostic');
    expect(intent.context.fields.diagnostics).toEqual([
      { code: 'E_UNDECLARED', message: 'Undeclared variable Run', path: 'src/Main.st', line: 14, column: 3 },
    ]);
    expect(accepted('debug', intent.context.fields)).toBe(true);
  });

  it('AIX-003 a diagnostic with no code or a long message still fits what the provider accepts', () => {
    const intent = diagnosticIntent({ message: 'm'.repeat(400), element: 'rung:r1' });
    expect(intent.context.fields.diagnostics?.[0]).toMatchObject({ code: 'DIAGNOSTIC', element: 'rung:r1' });
    expect(intent.context.fields.diagnostics?.[0]?.message?.length).toBe(256);
    expect(accepted('debug', intent.context.fields)).toBe(true);
  });

  it('AIX-003 a failed test opens the Assistant in debug mode with the scenario, the assertion and the checks', () => {
    const intent = failureIntent({
      id: 'motor',
      path: 'tests/motor.scenario.json',
      kind: 'AT',
      atMs: 10,
      index: 1,
      checks: [
        { signal: 'Motor.Forward', expected: false, observed: true },
        { signal: 'fact:tank.level', expected: { min: 2, max: 4 } },
      ],
    });
    expect(intent.mode).toBe('debug');
    expect(intent.context.fields.failedScenarios).toEqual([
      {
        id: 'motor',
        assertions: [
          {
            index: 1,
            kind: 'AT',
            atMs: 10,
            checks: [
              { signal: 'Motor.Forward', expected: false, observed: true },
              { signal: 'fact:tank.level', expected: '[2, 4]', observed: 'unobserved' },
            ],
          },
        ],
      },
    ]);
    expect(accepted('debug', intent.context.fields)).toBe(true);
  });

  it('AIX-003 the lesson guide asks for a hint in ask mode with the lesson, never a solution', () => {
    const intent = lessonIntent('ld-no-nc-contacts', 'No NC contacts');
    expect(intent.mode).toBe('ask');
    expect(intent.context.fields.lessonContext).toEqual({ lessonId: 'ld-no-nc-contacts' });
    expect(intent.prompt?.toLowerCase()).toContain('hint');
    expect(accepted('ask', intent.context.fields)).toBe(true);
  });

  it('AIX-003 an editor selection opens the Assistant in ask mode with the lines or the element', () => {
    const lines = selectionIntent('src/Main.st', { startLine: 2, endLine: 3, text: 'Run := TRUE;' });
    expect(lines.mode).toBe('ask');
    expect(lines.context.fields.selection).toEqual({ startLine: 2, endLine: 3, text: 'Run := TRUE;' });
    expect(accepted('ask', lines.context.fields)).toBe(true);
    const element = selectionIntent('src/Main.ld.json', { element: 'rung:r1' });
    expect(element.context.fields.selection).toEqual({ element: 'rung:r1' });
    expect(accepted('ask', element.context.fields)).toBe(true);
  });

  it('AIX-003 openAssistantWith reveals the Assistant, holds the intent once and clears it when it is taken', () => {
    const shown: string[] = [];
    const unbind = bindCommands({ 'view.agent': () => void shown.push('view.agent') });
    openAssistantWith(lessonIntent('ld-no-nc-contacts', 'No NC contacts'));
    unbind();
    expect(shown).toEqual(['view.agent']);
    const pending = useAssistantEntry.getState().pending;
    expect(pending?.context.kind).toBe('lesson');
    useAssistantEntry.getState().take();
    expect(useAssistantEntry.getState().pending).toBeNull();
  });

  it('AIX-003 two openings are two intents, so the second is applied even when it equals the first', () => {
    openAssistantWith(lessonIntent('ld-no-nc-contacts', 'A'));
    const first = useAssistantEntry.getState().pending!.id;
    openAssistantWith(lessonIntent('ld-no-nc-contacts', 'A'));
    expect(useAssistantEntry.getState().pending!.id).not.toBe(first);
  });
});
