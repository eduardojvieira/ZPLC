import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloseProjectModal, DeleteModal } from './SidebarDialogs';
import { DeleteFolderDialog } from './ExplorerDialogs';

const noop = (): void => undefined;
const labels = (markup: string): string[] => Array.from(markup.matchAll(/<button[^>]*>(.*?)<\/button>/g), (match) => match[1] ?? '');

describe('UX-020 destructive file and project actions use the alert dialog', () => {
  it('UX-020 deleting a file asks in an alert dialog whose action names the deletion and whose Cancel comes first', () => {
    const out = renderToStaticMarkup(
      <DeleteModal isOpen fileName="Motor.st" isDeleting={false} error={null} onConfirm={noop} onCancel={noop} />,
    );
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('Motor.st');
    expect(labels(out)).toEqual(['Cancel', 'Delete file']);
    expect(out).toMatch(/data-variant="danger"[^>]*>Delete file</);
  });

  it('UX-020 deleting a file shows a failure in place and keeps both buttons disabled while it runs', () => {
    const out = renderToStaticMarkup(
      <DeleteModal isOpen fileName="Motor.st" isDeleting error="Permission denied" onConfirm={noop} onCancel={noop} />,
    );
    expect(out).toContain('role="alert"');
    expect(out).toContain('Permission denied');
    expect(out.match(/disabled=""/g)?.length).toBe(2);
  });

  it('UX-020 deleting a folder names the folder, lists the unsaved files it holds and names the action', () => {
    const out = renderToStaticMarkup(
      <DeleteFolderDialog name="libs" modifiedFiles={['libs/Pump.st']} onConfirm={async () => undefined} onCancel={noop} />,
    );
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('libs/Pump.st');
    expect(labels(out)).toEqual(['Cancel', 'Delete folder']);
  });

  it('UX-020 closing a project with unsaved changes offers continue, discard and save as an alert dialog', () => {
    const out = renderToStaticMarkup(<CloseProjectModal isOpen busy={false} onConfirm={noop} onSave={noop} onCancel={noop} />);
    expect(out).toContain('role="alertdialog"');
    expect(labels(out)).toEqual(['Continue editing', 'Discard changes and close', 'Save all and close']);
  });
});
