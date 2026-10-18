import { SIGNAL_PAINT, sampleTone, signalMark } from '../../../theme/signalTone';

/**
 * Format a value for display on the edge
 */
export function formatValue(value: unknown, dataType?: string): string {
  if (value === null || value === undefined) return '?';
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (typeof value === 'number') {
    // Format based on type
    if (dataType === 'REAL') {
      return value.toFixed(2);
    }
    if (dataType === 'TIME') {
      return `${value}ms`;
    }
    // Integer types
    return value.toString();
  }
  
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 8 ? value.slice(0, 8) + '…' : value;
  }
  
  return String(value);
}

/**
 * How a wire draws the value it carries (UX-009). The tone is the signal vocabulary's: only a BOOL that is TRUE is a
 * confirmed TRUE, so a non-zero number is not green. The cues besides colour are the line (a heavier wire carries TRUE, a
 * forced or a faulty value; a dashed wire carries a value that was not read) and the glyph in the label.
 */
export function edgeSignal({ liveValue, dataType, forced = false, fault = false }: { liveValue?: unknown; dataType?: string; debugActive?: boolean; forced?: boolean; fault?: boolean }) {
  const tone = sampleTone({ value: liveValue, type: dataType ?? (typeof liveValue === 'boolean' ? 'BOOL' : undefined), forced, error: fault ? 'fault' : null });
  const marked = tone === 'true' || tone === 'forced' || tone === 'fault';
  return {
    tone,
    stroke: marked ? SIGNAL_PAINT[tone].border : 'var(--visual-wire)',
    width: marked ? 3 : 2,
    dash: tone === 'unknown' ? '4 3' : undefined,
    label: [signalMark(tone), formatValue(liveValue, dataType)].filter(Boolean).join(' '),
  };
}
