import { describe, expect, it } from 'bun:test';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { setupDom } from '../test/dom';
import { ActionConfirmHost } from './ActionConfirmHost';
import type { DeployFacts } from './deployComparison';
import { confirmDeploy } from './deployConfirm';
import type { HardwareDeployConfirmation } from './hardwareDeployConfirmation';

const dom = await setupDom();

const facts: DeployFacts = {
  project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR, minor: ZPLC_CONSTANTS.VERSION_MINOR, draft: ZPLC_CONSTANTS.DRAFT_COUNTER }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 },
  device: { board: 'stm32f746g_disco', boardProfile: 'stm32f746g_disco/stm32f746xx', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR, minor: ZPLC_CONSTANTS.VERSION_MINOR }, draft: ZPLC_CONSTANTS.DRAFT_COUNTER, maxArtifactBytes: 4096, maxTasks: 4 },
  declaredSafe: [],
  transfer: 'framed',
};
const confirmation = (over: Partial<DeployFacts['device']> = {}) => ({ facts: { ...facts, device: { ...facts.device, ...over } } }) as HardwareDeployConfirmation;

describe('Hardware deploy admission and confirmation (COM-028, UX-019) in a DOM', () => {
  it('asks in an alert dialog named by the deploy question, with the project compared to the device in a table, and the safe answer focused', async () => {
    dom.render(<ActionConfirmHost />);
    void confirmDeploy(confirmation(), false);
    const dialog = await dom.screen.findByRole('alertdialog', { name: dom.t('deploy.title') });
    expect(dom.within(dialog).getByRole('table', { name: dom.t('deploy.table.caption') })).toBeTruthy();
    expect(dom.within(dialog).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(3);
    expect(document.activeElement?.textContent).toBe(dom.t('common.cancel'));
    await dom.act(async () => { dom.screen.getByRole('button', { name: dom.t('common.cancel') }).click(); });
  });

  it('answers yes when the deploy action is chosen and no when Cancel is', async () => {
    const { user } = dom.render(<ActionConfirmHost />);
    const yes = confirmDeploy(confirmation(), false);
    await user.click(await dom.screen.findByRole('button', { name: dom.t('deploy.action.deploy') }));
    expect(await yes).toBe(true);
    const no = confirmDeploy(confirmation(), false);
    await user.click(await dom.screen.findByRole('button', { name: dom.t('common.cancel') }));
    expect(await no).toBe(false);
  });

  it('names the action by its effect when the PLC runs, and Escape answers no', async () => {
    const { user } = dom.render(<ActionConfirmHost />);
    const answer = confirmDeploy(confirmation(), true);
    expect(await dom.screen.findByRole('button', { name: dom.t('deploy.action.stopAndDeploy') })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(await answer).toBe(false);
  });

  it('a device the project cannot run on blocks the deploy: only Close is offered and the answer is no', async () => {
    const { user } = dom.render(<ActionConfirmHost />);
    const answer = confirmDeploy(confirmation({ abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR + 1, minor: 0 } }), false);
    const dialog = await dom.screen.findByRole('alertdialog', { name: dom.t('deploy.blocked.title') });
    expect(dom.within(dialog).queryByRole('button', { name: dom.t('deploy.action.deploy') })).toBeNull();
    await user.click(dom.within(dialog).getByRole('button', { name: dom.t('deploy.close') }));
    expect(await answer).toBe(false);
  });
});
