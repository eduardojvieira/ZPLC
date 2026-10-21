/**
 * Connects the serial-port dialog to the main process (IDE-018). The main process asks which port to use when a page calls
 * `navigator.serial.requestPort()`; this shows the dialog with the ports it offers and answers with the one the user
 * chose, or with a cancel. The list follows the devices that come and go, and Refresh asks the main process for it again.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseSerialPortOffer, type SerialPortOffer } from '../../electron/serialPortProtocol';
import { SERIAL_BOARD_CATALOG } from '../config/serialBoards';
import { describePorts } from '../utils/serialPortChoice';
import { SerialPortDialog } from './SerialPortDialog';

export function SerialPortChooser() {
  const [bridge] = useState(() => window.electronAPI?.portChoice);
  const [offer, setOffer] = useState<SerialPortOffer | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // An offer that carries the id of the open question updates it; one with another id replaces it.
  const show = useCallback((next: SerialPortOffer) => {
    setOffer(next);
    setSelected((current) => (current !== null && next.ports.some((port) => port.portId === current) ? current : null));
  }, []);

  useEffect(
    () =>
      bridge?.onRequested((value) => {
        const parsed = parseSerialPortOffer(value);
        if (parsed) show(parsed);
      }),
    [bridge, show],
  );

  const rows = useMemo(() => describePorts(offer?.ports ?? [], SERIAL_BOARD_CATALOG), [offer]);
  const answer = useCallback(
    (portId: string | null) => {
      if (!bridge || !offer) return;
      setOffer(null);
      setSelected(null);
      void bridge.choose({ requestId: offer.requestId, portId }).catch(() => undefined);
    },
    [bridge, offer],
  );

  const refresh = useCallback(async () => {
    if (!bridge || !offer) return;
    setRefreshing(true);
    try {
      const current = parseSerialPortOffer(await bridge.list({ requestId: offer.requestId }));
      if (current) show(current);
      else setOffer(null); // the question is gone: the page that asked was closed or went on
    } catch {
      /* the previous list stays */
    } finally {
      setRefreshing(false);
    }
  }, [bridge, offer, show]);

  if (!offer) return null;
  return (
    <SerialPortDialog
      rows={rows}
      selectedPortId={selected}
      refreshing={refreshing}
      onSelect={setSelected}
      onChoose={() => answer(selected)}
      onRefresh={() => void refresh()}
      onCancel={() => answer(null)}
    />
  );
}
