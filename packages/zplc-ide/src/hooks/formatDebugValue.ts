/**
 * @file formatDebugValue.ts
 * @brief Text of a live value for the watch window and the editor, by its declared type.
 *
 * SPDX-License-Identifier: MIT
 *
 * Kept apart from the hook so that it is a pure function of its two arguments.
 */

import type { LiveValue } from '../store/useIDEStore';
import type { DebugDataType } from '../compiler';

/**
 * Format a value for display based on its type.
 *
 * @param value - The value to format
 * @param type - The data type
 * @returns Formatted string representation
 */
export function formatDebugValue(value: LiveValue | null, type: DebugDataType | null): string {
  if (value === null || value === undefined) {
    return '---';
  }

  if (type === null) {
    return String(value);
  }

  switch (type) {
    case 'BOOL':
      return value ? 'TRUE' : 'FALSE';

    case 'BYTE':
    case 'USINT':
      return `16#${(Number(value) & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;

    case 'WORD':
    case 'UINT':
      return `16#${(Number(value) & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;

    case 'DWORD':
    case 'UDINT':
      return `16#${(Number(value) >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

    case 'SINT':
    case 'INT':
    case 'DINT':
    case 'LINT':
    case 'ULINT':
      // a 64-bit value beyond 2^53 arrives as its decimal text: shown as it is, every digit
      return String(value);

    case 'LWORD': {
      // a bit string: 16 hexadecimal digits of the 64 bits
      try {
        return `16#${BigInt.asUintN(64, BigInt(typeof value === 'boolean' ? (value ? 1 : 0) : value))
          .toString(16)
          .toUpperCase()
          .padStart(16, '0')}`;
      } catch {
        return String(value);
      }
    }

    case 'REAL':
      // Format with reasonable precision
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return value.toFixed(1);
        }
        return value.toPrecision(6);
      }
      return String(value);

    case 'LREAL':
      // a double has 17 significant digits that matter: the shortest text that reads back as the same value
      if (typeof value === 'number') {
        if (Number.isNaN(value) || !Number.isFinite(value)) return String(value);
        if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toFixed(1);
        return String(value);
      }
      return String(value);

    case 'TIME':
      // Format as T#Xms
      if (typeof value === 'number') {
        if (value >= 1000) {
          return `T#${(value / 1000).toFixed(3)}s`;
        }
        return `T#${value}ms`;
      }
      return String(value);

    case 'STRING':
      return `'${String(value)}'`;

    default:
      // Unknown type or FB type
      return String(value);
  }
}
