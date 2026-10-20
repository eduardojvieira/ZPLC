/**
 * The wiring of a lesson on one learner board, drawn as a deterministic SVG and written as a text list (LRN-014, LRN-037).
 *
 * The diagram is a schematic, not a photograph: on the left a strip of the board's header with the pins the lesson uses
 * (GPIO, header position and channel id), in the middle each part as its symbol, on the right the GND rail. Every part,
 * pin and rail carries words, so colour is never the only cue; the SVG has a title and a description for a screen
 * reader, and `wiringCard` gives the same wiring as sentences to show beside it. Same inputs, same bytes.
 */
import { channelIn, type BoardChannel } from '../boardIo';
import phrases from './phrases.json';
import { channelOf, isOnBoard, partsFor, type WiringBoard, type WiringFile, type WiringLocale, type WiringPart } from './wiring';

type Phrase = keyof typeof phrases.en;
const say = (lang: WiringLocale, key: Phrase, values: Record<string, string> = {}): string =>
  phrases[lang][key].replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? `{${name}}`);

const ohmsText = (ohms: number): string => (ohms >= 1000 && ohms % 1000 === 0 ? `${ohms / 1000} kΩ` : `${ohms} Ω`);
const colorOf = (lang: WiringLocale, color: string | undefined): string => (color === 'red' || color === 'green' || color === 'yellow' ? say(lang, color) : color ?? '');
const where = (channel: BoardChannel): string => `${channel.pin} (${channel.location ?? channel.address}, ${channel.id})`;

/** One sentence per part wired on the board, in the order of the wiring file. */
export function wiringCard(board: WiringBoard, wiring: WiringFile, lang: WiringLocale): string[] {
  return partsFor(wiring, board).flatMap((part) => {
    const found = channelOf(board, part.channel);
    if (!found) return [];
    const channel = channelIn(found, lang);
    const values = {
      label: part.label[lang], pin: where(channel), ground: board.ground, supply: board.supply, analogGround: board.analogGround,
      color: colorOf(lang, part.color), ohms: ohmsText(part.resistorOhms ?? part.ohms ?? 0),
      pinName: channel.pin, location: channel.location ?? channel.address, id: channel.id,
    };
    if (isOnBoard(found)) return [say(lang, 'onBoard', values)];
    const kind = (['led', 'button', 'jumper', 'potentiometer', 'capacitor', 'resistor'] as const).find((entry) => entry === part.kind);
    return kind ? [say(lang, kind, values)] : [];
  });
}

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x: number, y: number, body: string, attributes = ''): string => `<text x="${x}" y="${y}"${attributes}>${escape(body)}</text>`;
const line = (points: string, attributes = ''): string => `<polyline points="${points}" fill="none"${attributes}/>`;

const WIDTH = 760;
const TOP = 56;
const ROW = 64;
const RAIL = 712;
const LED_FILL: Record<string, string> = { red: '#d62828', green: '#2a9d3a', yellow: '#e9c300' };

/** The symbol of one part on the row centred at `y`, from the end of its pin box to the GND rail. */
function symbol(part: WiringPart, board: WiringBoard, y: number, lang: WiringLocale): string[] {
  const ohms = ohmsText(part.resistorOhms ?? part.ohms ?? 0);
  const toRail = (from: number): string => line(`${from},${y} ${RAIL},${y}`);
  switch (part.kind) {
    case 'led':
      return [
        line(`264,${y} 300,${y}`),
        line(`300,${y} 306,${y - 8} 318,${y + 8} 330,${y - 8} 342,${y + 8} 354,${y - 8} 360,${y}`),
        text(330, y - 14, ohms, ' text-anchor="middle" font-size="11"'),
        line(`360,${y} 392,${y}`),
        `<polygon points="392,${y - 10} 392,${y + 10} 412,${y}" fill="${LED_FILL[part.color ?? ''] ?? '#ffffff'}"/>`,
        line(`412,${y - 10} 412,${y + 10}`),
        line(`402,${y - 14} 410,${y - 22}`), line(`408,${y - 12} 416,${y - 20}`),
        text(402, y + 26, say(lang, 'symbolLed', { color: colorOf(lang, part.color) }), ' text-anchor="middle" font-size="11"'),
        toRail(412),
      ];
    case 'button':
      return [
        line(`264,${y} 334,${y}`),
        `<circle cx="337" cy="${y}" r="3" fill="#ffffff"/>`, `<circle cx="377" cy="${y}" r="3" fill="#ffffff"/>`,
        line(`337,${y - 4} 375,${y - 16}`), line(`356,${y - 10} 356,${y - 24}`), line(`348,${y - 24} 364,${y - 24}`),
        text(357, y + 22, say(lang, 'symbolButton'), ' text-anchor="middle" font-size="11"'),
        toRail(380),
      ];
    case 'jumper':
      return [
        line(`264,${y} ${RAIL},${y}`, ' stroke-dasharray="6 4"'),
        text(357, y + 18, say(lang, 'symbolJumper'), ' text-anchor="middle" font-size="11"'),
      ];
    case 'potentiometer':
      return [
        line(`264,${y - 20} 380,${y - 20} 380,${y - 14}`),
        `<polygon points="375,${y - 14} 385,${y - 14} 380,${y - 8}" fill="#222222"/>`,
        `<rect x="350" y="${y - 8}" width="60" height="16" fill="#ffffff"/>`,
        line(`350,${y} 330,${y} 330,${y + 18}`),
        text(330, y + 30, board.supply, ' text-anchor="start" font-size="11"'),
        text(420, y + 20, say(lang, 'symbolPotentiometer', { ohms }), ' font-size="11"'),
        toRail(410),
      ];
    case 'capacitor':
      return [
        line(`264,${y} 346,${y}`), line(`346,${y - 10} 346,${y + 10}`), line(`354,${y - 10} 354,${y + 10}`),
        text(350, y + 24, say(lang, 'symbolCapacitor'), ' text-anchor="middle" font-size="11"'),
        toRail(354),
      ];
    default:
      return [
        line(`264,${y} 300,${y}`),
        line(`300,${y} 306,${y - 8} 318,${y + 8} 330,${y - 8} 342,${y + 8} 354,${y - 8} 360,${y}`),
        text(330, y - 14, ohms, ' text-anchor="middle" font-size="11"'),
        toRail(360),
      ];
  }
}

/** The diagram of the wiring of a lesson on one board. */
export function renderWiringSvg(board: WiringBoard, wiring: WiringFile, lang: WiringLocale): string {
  const rows = partsFor(wiring, board).flatMap((part) => {
    const channel = channelOf(board, part.channel);
    return channel ? [{ part, channel: channelIn(channel, lang), onBoard: isOnBoard(channel) }] : [];
  });
  const height = TOP + rows.length * ROW + 56;
  const id = `wiring-${board.boardId}`;
  const heading = say(lang, 'heading', { board: board.displayName });
  const body: string[] = [
    `<rect width="${WIDTH}" height="${height}" fill="#ffffff" stroke="none"/>`,
    text(16, 30, heading, ' font-size="15" font-weight="bold"'),
    `<rect x="8" y="${TOP - 8}" width="256" height="${rows.length * ROW + 16}" rx="8" fill="#eef3f8"/>`,
  ];
  rows.forEach(({ part, channel, onBoard }, index) => {
    const y = TOP + index * ROW + ROW / 2;
    body.push(
      `<rect x="20" y="${y - 22}" width="232" height="44" rx="4" fill="#ffffff"${onBoard ? ' stroke-dasharray="4 3"' : ''}/>`,
      text(30, y - 4, channel.pin, ' font-size="13" font-weight="bold"'),
      text(30, y + 14, `${channel.location ?? channel.address} · ${channel.id}`, ' font-size="11"'),
      text(440, y - 8, part.label[lang], ' font-size="13" font-weight="bold"'),
      ...(onBoard ? [text(280, y + 4, say(lang, 'symbolOnBoard'), ' font-size="11" font-style="italic"')] : symbol(part, board, y, lang)),
    );
  });
  const wired = rows.filter((row) => !row.onBoard).map((_, index) => index);
  if (wired.length > 0) {
    const top = TOP + 8;
    const bottom = TOP + rows.length * ROW;
    body.push(
      line(`${RAIL},${top} ${RAIL},${bottom}`, ' stroke-width="3"'),
      line(`${RAIL - 12},${bottom} ${RAIL + 12},${bottom}`), line(`${RAIL - 8},${bottom + 5} ${RAIL + 8},${bottom + 5}`), line(`${RAIL - 4},${bottom + 10} ${RAIL + 4},${bottom + 10}`),
      text(RAIL + 16, bottom + 30, board.ground, ' text-anchor="end" font-size="12" font-weight="bold"'),
    );
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-labelledby="${id}-title ${id}-desc" font-family="sans-serif" fill="#111111" stroke="#222222" stroke-width="1.5">`,
    `<title id="${id}-title">${escape(heading)}</title>`,
    `<desc id="${id}-desc">${escape(wiringCard(board, wiring, lang).join(' '))}</desc>`,
    ...body.map((element) => element.replace('<text ', '<text stroke="none" ')),
    '</svg>',
    '',
  ].join('\n');
}
