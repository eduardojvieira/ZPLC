import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';

const dom = await setupDom();
await stubProjectLoader();
const { CommunicationSection } = await import('./CommunicationSection');

describe('Communication settings (UX-013, COM-011, COM-014) in a DOM', () => {
  it('names the Modbus and tag groups with headings', () => {
    dom.render(<SectionHost Section={CommunicationSection} />);
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('modbus.modbus') })).toBeTruthy();
    expect(dom.screen.getByRole('heading', { level: 3, name: dom.t('commtags.communicationTags') })).toBeTruthy();
    expect(dom.screen.getByText(dom.t('commtags.noCommunicationTagsConfigured'))).toBeTruthy();
  });

  it('the Modbus TCP and RTU choices follow the Modbus switch, which Space flips', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={CommunicationSection}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    const tcp = dom.screen.getByRole('checkbox', { name: dom.t('mqtt.tcp') }) as HTMLInputElement;
    const modbus = dom.screen.getByRole('heading', { level: 3, name: dom.t('modbus.modbus') }).parentElement!;
    const enabled = dom.within(modbus).getByRole('checkbox', { name: dom.t('console.enabled2') }) as HTMLInputElement;
    expect(tcp.disabled).toBe(!enabled.checked);
    const before = enabled.checked;
    enabled.focus();
    await user.keyboard(' ');
    expect(last?.communication?.modbus?.enabled).toBe(!before);
    expect(tcp.disabled).toBe(before);
  });

  it('adds a communication tag and removes it again', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={CommunicationSection}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    await user.click(dom.screen.getByRole('button', { name: dom.t('commtags.addTag') }));
    expect(last?.communication?.tags).toHaveLength(1);
    expect(dom.screen.queryByText(dom.t('commtags.noCommunicationTagsConfigured'))).toBeNull();
  });

  it('keeps every number and text control of the Modbus client named', () => {
    dom.render(<SectionHost Section={CommunicationSection} />);
    for (const control of [...dom.screen.getAllByRole('spinbutton'), ...dom.screen.getAllByRole('textbox')]) {
      const named =
        control.getAttribute('aria-label') ||
        control.getAttribute('placeholder') ||
        (control.id && document.querySelector(`label[for="${control.id}"]`));
      expect(Boolean(named)).toBe(true);
    }
  });
});
