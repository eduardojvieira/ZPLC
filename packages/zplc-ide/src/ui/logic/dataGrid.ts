/** Sorting of a data grid column: pure, so the order is proven without a DOM. */
export type SortDirection = 'none' | 'ascending' | 'descending';

export const nextSort = (direction: SortDirection): SortDirection => (direction === 'none' ? 'ascending' : direction === 'ascending' ? 'descending' : 'none');

/** Rows ordered by a key (numbers as numbers, text by locale); the input is not changed and `none` returns it as it is. */
export function sortRows<T>(rows: readonly T[], key: (row: T) => string | number, direction: SortDirection): readonly T[] {
  if (direction === 'none') return rows;
  const sign = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = key(a), y = key(b);
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)));
  });
}
