import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';

const dom = await setupDom();
await stubProjectLoader();
const { NetworkSection } = await import('./NetworkSection');
const { BOARD_OPTIONS, getBoardNetworkType } = await import('../../config/boardProfiles');

const boardWith = (kind: string): string | undefined =>
  BOARD_OPTIONS.find((option) => option.value && option.value !== 'custom' && getBoardNetworkType(option.value) === kind)?.value;
const target = (board: string) => ({ board }) as ZPLCProjectConfig['target'];

describe('Network settings (UX-013, COM-027) in a DOM', () => {
  it('tells a person whose board has no network interface to choose another board', () => {
    dom.render(<SectionHost Section={NetworkSection} />);
    expect(dom.screen.getByText(dom.t('network.selectABoardWith'))).toBeTruthy();
    expect(dom.screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('on an Ethernet board offers DHCP and shows the static address fields only when DHCP is off', async () => {
    const board = boardWith('ethernet');
    if (!board) return;
    const { user } = dom.render(<SectionHost Section={NetworkSection} initial={{ target: target(board) }} />);
    const dhcp = dom.screen.getByRole('checkbox', { name: dom.t('network.dhcp') }) as HTMLInputElement;
    expect(dhcp.checked).toBe(true);
    const fields = dom.screen.getAllByRole('textbox').length;
    await user.click(dhcp);
    expect(dhcp.checked).toBe(false);
    expect(dom.screen.getAllByRole('textbox').length).toBeGreaterThan(fields);
  });

  it(
    'on a Wi-Fi board names the security choice, keeps the password field disabled and says credentials stay out of the ' + 'project',
    async () => {
      const board = boardWith('wifi');
      if (!board) return;
      let last: ZPLCProjectConfig | undefined;
      const { user } = dom.render(
        <SectionHost
          Section={NetworkSection}
          initial={{ target: target(board) }}
          onConfig={(config) => {
            last = config;
          }}
        />,
      );
      expect((dom.screen.getByLabelText(dom.t('network.wiFiPassword')) as HTMLInputElement).disabled).toBe(true);
      expect(dom.screen.getByText(dom.t('network.credentialsAreExcludedFrom'))).toBeTruthy();
      await user.selectOptions(dom.screen.getByRole('combobox', { name: dom.t('network.security') }), 'open');
      expect(last?.network?.wifi?.security).toBe('open');
    },
  );

  it('the NTP server field takes a new address', async () => {
    const board = boardWith('ethernet') ?? boardWith('wifi');
    if (!board) return;
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(
      <SectionHost
        Section={NetworkSection}
        initial={{ target: target(board) }}
        onConfig={(config) => {
          last = config;
        }}
      />,
    );
    const server = dom.screen.getByDisplayValue('pool.ntp.org');
    await user.clear(server);
    await user.type(server, 'time.example.org');
    expect(last?.network?.ntp?.server).toBe('time.example.org');
  });
});
