/**
 * @file consoleEntryStyle.tsx
 * @brief The icon, the colour and the clock text of an Output entry.
 */

import { XCircle, AlertCircle, CheckCircle, Terminal, Info } from 'lucide-react';
import type { ConsoleEntry } from '../types';

export const getEntryIcon = (type: ConsoleEntry['type']) => {
  switch (type) {
    case 'error':
      return <XCircle size={14} className="text-[var(--color-accent-red)] flex-shrink-0" />;
    case 'warning':
      return <AlertCircle size={14} className="text-[var(--color-accent-yellow)] flex-shrink-0" />;
    case 'success':
      return <CheckCircle size={14} className="text-[var(--color-accent-green)] flex-shrink-0" />;
    case 'command':
      return <Terminal size={14} className="text-[var(--color-accent-purple)] flex-shrink-0" />;
    default:
      return <Info size={14} className="text-[var(--color-accent-blue)] flex-shrink-0" />;
  }
};

export const getEntryColor = (type: ConsoleEntry['type']) => {
  switch (type) {
    case 'error':
      return 'text-[var(--color-accent-red)]';
    case 'warning':
      return 'text-[var(--color-accent-yellow)]';
    case 'success':
      return 'text-[var(--color-accent-green)]';
    case 'command':
      return 'text-[var(--color-accent-purple)]';
    default:
      return 'text-[var(--color-surface-200)]';
  }
};

export const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
