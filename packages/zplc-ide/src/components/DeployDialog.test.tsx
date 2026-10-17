import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { translatorFor } from '../i18n';
import { answerConfirmation, currentConfirmation, mountConfirmHost } from '../store/actionConfirm';
import { auditMarkup } from '../ui/audit';
import { compareDeployFacts, type DeployFacts } from './deployComparison';
import { confirmDeploy, deployRequest, showDeployRefusal } from './deployConfirm';
import { DeployDialogBody } from './DeployDialog';
import type { HardwareDeployConfirmation } from './hardwareDeployConfirmation';

const facts: DeployFacts = {
  project: { name: 'Pump station', board: 'STM32F746G Discovery', boardProfile: 'stm32f746g_disco/stm32f746xx', abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR, minor: ZPLC_CONSTANTS.VERSION_MINOR, draft: ZPLC_CONSTANTS.DRAFT_COUNTER }, sha256: 'a1b2c3d4e5f6a7b8c9d0', byteLength: 512, taskCount: 2 },
  device: { board: 'stm32f746g_disco', boardProfile: 'stm32f746g_disco/stm32f746xx', zplcVersion: '1.0.0', zephyrVersion: '4.0.0', abi: { major: ZPLC_CONSTANTS.VERSION_MAJOR, minor: ZPLC_CONSTANTS.VERSION_MINOR }, draft: ZPLC_CONSTANTS.DRAFT_COUNTER, maxArtifactBytes: 4096, maxTasks: 4 },
  declaredSafe: [],
  transfer: 'framed',
};
const confirmation = { facts } as HardwareDeployConfirmation;
const body = (request: ReturnType<typeof deployRequest>) => renderToStaticMarkup(<>{request.body}</>);

describe('UX-019 deploy dialog', () => {
  it('UX-019 names the action by its effect: Stop PLC and deploy when the PLC runs, Deploy otherwise, with Cancel beside it', () => {
    const running = deployRequest(facts, { running: true });
    expect(running).toMatchObject({ actionLabel: 'Stop PLC and deploy', cancelLabel: 'Cancel', destructive: true, title: 'Deploy to the device?' });
    expect(running.description).toContain('Deploy stops it');
    const stopped = deployRequest(facts, { running: false });
    expect(stopped).toMatchObject({ actionLabel: 'Deploy', cancelLabel: 'Cancel', destructive: false });
    expect(stopped.description).toContain('leaves the PLC stopped');
  });

  it('UX-019 compares the project and the device in a table with a header, row headers and a verdict in words and icon', () => {
    const out = body(deployRequest(facts, { running: false }));
    expect(out).toContain('<caption class="ui-visually-hidden">The project compared with the device</caption>');
    for (const label of ['Board', 'Board profile', 'Firmware version', 'ABI version', 'Program', 'Size', 'Tasks']) expect(out).toContain(`>${label}</th>`);
    expect(out).toContain('scope="col"');
    expect(out).toContain('1.0.0 (Zephyr 4.0.0)');
    expect(out).toContain('Pump station, SHA-256 a1b2c3d4e5f6');
    expect(out).toContain('Not reported by the device');
    expect(out).toMatch(/data-row="identity" data-status="unreported"/);
    expect(out).toContain('Matches');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-019 states what the outputs do during the transfer and that the PLC stays stopped', () => {
    const out = body(deployRequest(facts, { running: false }));
    expect(out).toContain('Every output stays off while the old program stops, the new one is written and the PLC stays stopped.');
    expect(out).toContain('Studio does not measure the pins of this board.');
  });

  it('UX-019 highlights a mismatch by text and icon, gives its message, and offers only Close', () => {
    const wrong: DeployFacts = { ...facts, device: { ...facts.device!, boardProfile: 'rpi_pico/rp2040' } };
    const request = deployRequest(wrong, { running: true });
    expect(request).toMatchObject({ actionLabel: null, cancelLabel: 'Close', title: 'Deploy blocked', destructive: false });
    const out = body(request);
    expect(out).toMatch(/data-row="profile" data-status="mismatch"/);
    expect(out).toContain('Does not match');
    expect(out).toMatch(/data-status="mismatch"[\s\S]*?<svg[^>]*aria-hidden="true"/);
    expect(out).toContain('The project builds for stm32f746g_disco/stm32f746xx and the device reports rpi_pico/rp2040.');
    expect(out).toContain('data-deploy-problems');
  });

  it('UX-019 explains a refusal by admission above the table, in an alert', () => {
    const request = deployRequest(facts, { running: false, refusal: 'Program was built for contract draft 6, this runtime is draft 7' });
    const out = body(request);
    expect(request.actionLabel).toBeNull();
    expect(out).toContain('role="alert"');
    expect(out).toContain('this runtime is draft 7');
  });

  it('UX-019 resolves true only when the person confirms, and a blocked deploy can never be confirmed', async () => {
    const unmount = mountConfirmHost();
    const yes = confirmDeploy(confirmation, true);
    expect(currentConfirmation()?.actionLabel).toBe('Stop PLC and deploy');
    answerConfirmation(true);
    expect(await yes).toBe(true);
    const no = confirmDeploy(confirmation, false);
    answerConfirmation(false);
    expect(await no).toBe(false);
    const tooManyTasks = confirmDeploy({ facts: { ...facts, device: { ...facts.device!, maxTasks: 1 } } } as HardwareDeployConfirmation, false);
    answerConfirmation(true);
    expect(await tooManyTasks).toBe(false);
    const refused = showDeployRefusal({ ...facts, device: null }, undefined);
    expect(currentConfirmation()).toMatchObject({ actionLabel: null, title: 'Deploy blocked' });
    answerConfirmation(true);
    expect(await refused).toBe(false);
    unmount();
  });

  it('UX-019 keeps the Spanish dialog complete', () => {
    const es = compareDeployFacts(facts, translatorFor('es').t);
    const out = renderToStaticMarkup(<DeployDialogBody comparison={es} />);
    expect(out).toContain('Versión de ABI');
  });
});
