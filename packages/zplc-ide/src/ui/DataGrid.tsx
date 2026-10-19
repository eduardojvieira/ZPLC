/**
 * A data grid (UX-001): a native table (`role="grid"`) with column headers, optional sortable columns (`aria-sort`) and
 * tabular numerals for numeric columns. Rows are keyed by `rowId`. Sorting is `logic/dataGrid.ts`.
 */
import { useState, type ReactNode } from 'react';
import { cx } from './cx';
import { nextSort, sortRows, type SortDirection } from './logic/dataGrid';

export interface DataGridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable by this key. */
  sortKey?: (row: T) => string | number;
  numeric?: boolean;
}

export interface DataGridProps<T> {
  label: string;
  columns: readonly DataGridColumn<T>[];
  rows: readonly T[];
  rowId: (row: T) => string;
  emptyText?: string;
  className?: string;
}

export function DataGrid<T>({ label, columns, rows, rowId, emptyText, className }: DataGridProps<T>) {
  const [sort, setSort] = useState<{ column: string; direction: SortDirection }>({ column: '', direction: 'none' });
  const sorter = columns.find((column) => column.id === sort.column)?.sortKey;
  const shown = sorter ? sortRows(rows, sorter, sort.direction) : rows;
  return (
    <table role="grid" aria-label={label} className={cx('ui-grid', className)}>
      <thead>
        <tr>
          {columns.map((column) => {
            const direction = sort.column === column.id ? sort.direction : 'none';
            return (
              <th key={column.id} scope="col" aria-sort={column.sortKey ? direction : undefined} data-numeric={column.numeric || undefined}>
                {column.sortKey
                  ? <button type="button" className="ui-grid-sort" onClick={() => setSort({ column: column.id, direction: nextSort(direction) })}>{column.header}</button>
                  : column.header}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => (
          <tr key={rowId(row)}>
            {columns.map((column) => <td key={column.id} className={column.numeric ? 'ui-tabular' : undefined} data-numeric={column.numeric || undefined}>{column.cell(row)}</td>)}
          </tr>
        ))}
        {shown.length === 0 && emptyText && <tr><td colSpan={columns.length} className="ui-grid-empty">{emptyText}</td></tr>}
      </tbody>
    </table>
  );
}
