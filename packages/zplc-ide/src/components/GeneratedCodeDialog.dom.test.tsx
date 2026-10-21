import { describe, expect, it, mock } from 'bun:test';
import { setupDom } from '../test/dom';
import { GeneratedCodeDialog } from './GeneratedCodeDialog';

const dom = await setupDom();

const CODE = 'PROGRAM Main\nVAR x : INT; END_VAR\nx := 1;\nEND_PROGRAM';

describe('Generated code and assembly view (CMP-060) in a DOM', () => {
  it('renders nothing while closed', () => {
    const { container } = dom.render(
      <GeneratedCodeDialog isOpen={false} onClose={() => undefined} sourceLanguage="FBD" generatedCode={CODE} />,
    );
    expect(container.textContent).toBe('');
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });

  it('is a dialog named by the language it was generated from, and shows the code and its size', () => {
    dom.render(<GeneratedCodeDialog isOpen onClose={() => undefined} sourceLanguage="FBD" generatedCode={CODE} />);
    expect(dom.screen.getByRole('dialog', { name: dom.t('workbench.generated.titleStructuredText', { language: 'FBD' }) })).toBeTruthy();
    expect(dom.screen.getByText((_, node) => node?.tagName === 'CODE' && node.textContent === CODE)).toBeTruthy();
    expect(dom.screen.getByText(/4/)).toBeTruthy();
  });

  it('the assembly view has its own title and no create-file action', () => {
    dom.render(
      <GeneratedCodeDialog isOpen onClose={() => undefined} sourceLanguage="ASM" generatedCode="PUSH 1" onCreateFile={undefined} />,
    );
    expect(dom.screen.getByRole('dialog', { name: dom.t('workbench.generated.titleAssembly') })).toBeTruthy();
    expect(dom.screen.queryByRole('button', { name: dom.t('workbench.generated.createFile', { extension: '.asm' }) })).toBeNull();
  });

  it('Copy puts the code on the clipboard and says it did', async () => {
    const { user } = dom.render(<GeneratedCodeDialog isOpen onClose={() => undefined} sourceLanguage="FBD" generatedCode={CODE} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.generated.copy') }));
    expect(await navigator.clipboard.readText()).toBe(CODE); // user-event gives the page a clipboard of its own
    expect(await dom.screen.findByRole('button', { name: dom.t('workbench.generated.copied') })).toBeTruthy();
  });

  it('Create file hands the code over and closes', async () => {
    const onCreateFile = mock<(code: string) => unknown>(() => undefined);
    const onClose = mock(() => undefined);
    const { user } = dom.render(
      <GeneratedCodeDialog isOpen onClose={onClose} sourceLanguage="LD" generatedCode={CODE} onCreateFile={onCreateFile} />,
    );
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.generated.createFile', { extension: '.st' }) }));
    expect(onCreateFile).toHaveBeenCalledWith(CODE);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape and the close button both ask to close', async () => {
    const onClose = mock(() => undefined);
    const { user } = dom.render(<GeneratedCodeDialog isOpen onClose={onClose} sourceLanguage="SFC" generatedCode={CODE} />);
    await user.keyboard('{Escape}');
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.dialog.close') }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
