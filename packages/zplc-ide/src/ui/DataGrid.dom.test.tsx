import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { DataGrid } from './index';

const dom = await setupDom();

interface Row {
  id: string;
  name: string;
  value: number;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Speed', value: 30 },
  { id: 'b', name: 'Level', value: 10 },
  { id: 'c', name: 'Temp', value: 20 },
];
const COLUMNS = [
  { id: 'name', header: 'Name', cell: (row: Row) => row.name, sortKey: (row: Row) => row.name },
  { id: 'value', header: 'Value', cell: (row: Row) => row.value, sortKey: (row: Row) => row.value, numeric: true },
  { id: 'note', header: 'Note', cell: () => '-' },
];

const names = (): string[] =>
  dom.screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent ?? '');

describe('DataGrid (UX-001) in a DOM', () => {
  it('is a named grid with a column header per column and a row per record', () => {
    dom.render(<DataGrid label="Variables" columns={COLUMNS} rows={ROWS} rowId={(row) => row.id} />);
    expect(dom.screen.getByRole('grid', { name: 'Variables' })).toBeTruthy();
    expect(dom.screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Value', 'Note']);
    expect(names()).toEqual(['Speed', 'Level', 'Temp']);
  });

  it('a sort button cycles ascending, descending and none, and says so in aria-sort', async () => {
    const { user } = dom.render(<DataGrid label="Variables" columns={COLUMNS} rows={ROWS} rowId={(row) => row.id} />);
    const header = dom.screen.getByRole('columnheader', { name: 'Name' });
    expect(header.getAttribute('aria-sort')).toBe('none');
    await user.click(dom.screen.getByRole('button', { name: 'Name' }));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(names()).toEqual(['Level', 'Speed', 'Temp']);
    await user.click(dom.screen.getByRole('button', { name: 'Name' }));
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Temp', 'Speed', 'Level']);
    await user.click(dom.screen.getByRole('button', { name: 'Name' }));
    expect(header.getAttribute('aria-sort')).toBe('none');
    expect(names()).toEqual(['Speed', 'Level', 'Temp']);
  });

  it('the keyboard sorts: Tab to the header button and Enter', async () => {
    const { user } = dom.render(<DataGrid label="Variables" columns={COLUMNS} rows={ROWS} rowId={(row) => row.id} />);
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(dom.screen.getByRole('columnheader', { name: 'Value' }).getAttribute('aria-sort')).toBe('ascending');
    expect(names()).toEqual(['Level', 'Temp', 'Speed']);
  });

  it('a column without a sort key has no sort button and no aria-sort', () => {
    dom.render(<DataGrid label="Variables" columns={COLUMNS} rows={ROWS} rowId={(row) => row.id} />);
    expect(dom.screen.queryByRole('button', { name: 'Note' })).toBeNull();
    expect(dom.screen.getByRole('columnheader', { name: 'Note' }).hasAttribute('aria-sort')).toBe(false);
  });

  it('shows the empty text when there is no row', () => {
    dom.render(<DataGrid label="Variables" columns={COLUMNS} rows={[]} rowId={(row: Row) => row.id} emptyText="No variables" />);
    expect(dom.screen.getByRole('cell', { name: 'No variables' })).toBeTruthy();
  });
});
