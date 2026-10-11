/** The catalog of the serial-port dialog, built from the board manifest and the USB identifier file of the HIL tools (IDE-018). */
import boardManifest from '../../../../firmware/app/boards/boards.json';
import usbIds from '../../../../tools/hil/usb-ids.json';
import { SERIAL_VENDORS } from '../uploader/serialVendors';
import { buildSerialBoardCatalog } from '../utils/serialPortChoice';

export const SERIAL_BOARD_CATALOG = buildSerialBoardCatalog(boardManifest, usbIds, SERIAL_VENDORS);
