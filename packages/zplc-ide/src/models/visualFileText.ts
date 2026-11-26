/**
 * The words of a violation of a visual file, in the language of the interface (AIX-013, UX-029): the loader returns the
 * violation as data, and the editor's open error and the Assistant's refusals say it through the catalogue.
 */
import { t } from '../i18n';
import type { VisualFileViolation } from './visualFileLoad';

export function visualViolationText(detail: VisualFileViolation): string {
  const path = detail.path || t('workbench.editor.violation.document');
  const values = (detail.acceptedValues ?? []).join(', ');
  switch (detail.code) {
    case 'not-json':
      return t('workbench.editor.violation.notJson', { reason: detail.reason ?? '' });
    case 'invalid-value':
      return t('workbench.editor.violation.invalidValue', { path, found: detail.found ?? '', values });
    case 'missing-field':
      return t('workbench.editor.violation.missingField', { path });
    case 'unknown-block':
      return t('workbench.editor.violation.unknownBlock', { path, block: detail.block ?? '', found: detail.found ?? '', values });
    case 'invalid':
      return t('workbench.editor.violation.other', { path, reason: detail.reason ?? '' });
  }
}
