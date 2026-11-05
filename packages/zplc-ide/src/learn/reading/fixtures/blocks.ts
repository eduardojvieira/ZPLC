/** Hand-built reading blocks for the renderer tests (readingTypes.ts), one of every kind. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReadingBlock, ReadingInline } from '../../readingTypes';

export const OFF_DELAY_SRC = 'reading/off-delay.ld.json';
export const OFF_DELAY = readFileSync(join(import.meta.dir, 'off-delay.ld.json'), 'utf8');

export const text = (value: string): ReadingInline => ({ type: 'text', value });

export const BLOCKS: ReadingBlock[] = [
  { type: 'heading', depth: 2, children: [text('Why a stop button is wired NC')] },
  {
    type: 'paragraph',
    children: [
      text('A '),
      { type: 'strong', children: [text('stop')] },
      text(' button is '),
      { type: 'emphasis', children: [text('fail-safe')] },
      text(' when read as '),
      { type: 'code', value: 'NOT Stop' },
      text('.'),
    ],
  },
  { type: 'heading', depth: 3, children: [text('The idea')] },
  {
    type: 'list',
    ordered: false,
    items: [
      [{ type: 'paragraph', children: [text('Wire the contact closed at rest')] }],
      [{ type: 'paragraph', children: [text('Read it')] }],
    ],
  },
  {
    type: 'list',
    ordered: true,
    items: [[{ type: 'paragraph', children: [text('First')] }], [{ type: 'paragraph', children: [text('Second')] }]],
  },
  {
    type: 'table',
    header: [[text('Signal')], [text('Rest')]],
    align: ['left', 'right'],
    rows: [[[text('Stop')], [text('TRUE')]]],
  },
  { type: 'callout', kind: 'tip', children: [{ type: 'paragraph', children: [text('Try the lab below.')] }] },
  { type: 'callout', kind: 'warning', children: [{ type: 'paragraph', children: [text('A broken wire looks like a press.')] }] },
  { type: 'code', lang: 'st', value: 'Lamp := Button;' },
  { type: 'image', src: 'images/relay-panel.svg', alt: 'A relay panel with three relays' },
  { type: 'rule' },
  {
    type: 'directive',
    line: 30,
    directive: { kind: 'ld-figure', data: { src: OFF_DELAY_SRC, caption: 'The output keeps its own rung alive' } },
  },
  {
    type: 'directive',
    line: 40,
    directive: {
      kind: 'timing',
      data: {
        span: 6000,
        signals: [
          { name: 'Button', edges: [500, 1500] },
          { name: 'Lamp', edges: [500, 1800] },
        ],
        marks: [{ from: 1500, to: 1800, label: 'PT' }],
        caption: 'TOF keeps Q on for PT after IN falls',
      },
    },
  },
  {
    type: 'directive',
    line: 50,
    directive: {
      kind: 'quiz',
      data: {
        question: 'The stop button is wired NC. What does the program read while nobody presses it?',
        options: [
          { text: 'TRUE', correct: true, feedback: 'The NC contact conducts at rest, so the input is on.' },
          { text: 'FALSE', feedback: 'That would be a normally open button.' },
        ],
      },
    },
  },
  {
    type: 'directive',
    line: 60,
    directive: {
      kind: 'ld-try',
      data: {
        src: OFF_DELAY_SRC,
        inputs: [{ name: 'Button', kind: 'push' }],
        outputs: ['Light'],
        timing: ['Button', 'Light'],
        caption: 'Press the button',
      },
    },
  },
];
