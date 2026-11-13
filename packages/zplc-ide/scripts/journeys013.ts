/**
 * The journeys of lane W and of milestone U2 (spec 013), one file per task so that no two writers share one.
 * `journeys.ts`
 * spreads `JOURNEYS_013` into its list; the files are created empty by task W0.
 */
import type { Journey } from './journeys';
import { journeysW2 } from './journeys013/w2';
import { journeysW3 } from './journeys013/w3';
import { journeysW4 } from './journeys013/w4';
import { journeysW6 } from './journeys013/w6';
import { journeysW7 } from './journeys013/w7';
import { journeysW8 } from './journeys013/w8';
import { journeysW9 } from './journeys013/w9';
import { journeysU2R4 } from './journeys013/u2-r4';
import { journeysU2T2 } from './journeys013/u2-t2';
import { journeysU2T3 } from './journeys013/u2-t3';
import { journeysU2T4 } from './journeys013/u2-t4';
import { journeysU2H1 } from './journeys013/u2-h1';
import { journeysU2H2 } from './journeys013/u2-h2';
import { journeysU2H3 } from './journeys013/u2-h3';
import { journeysU2H4 } from './journeys013/u2-h4';
import { journeysU2H5 } from './journeys013/u2-h5';
import { journeysU2H6 } from './journeys013/u2-h6';
import { journeysU2P1 } from './journeys013/u2-p1';
import { journeysU2P2 } from './journeys013/u2-p2';
import { journeysU2P3 } from './journeys013/u2-p3';
import { journeysU2R3 } from './journeys013/u2-r3';
import { journeysU2V3 } from './journeys013/u2-v3';
import { journeysU2Q1 } from './journeys013/u2-q1';

export const JOURNEYS_013: Journey[] = [
  ...journeysW2,
  ...journeysW3,
  ...journeysW4,
  ...journeysW6,
  ...journeysW7,
  ...journeysW8,
  ...journeysW9,
  ...journeysU2R4,
  ...journeysU2T2,
  ...journeysU2T3,
  ...journeysU2T4,
  ...journeysU2H1,
  ...journeysU2H2,
  ...journeysU2H3,
  ...journeysU2H4,
  ...journeysU2H5,
  ...journeysU2H6,
  ...journeysU2P1,
  ...journeysU2P2,
  ...journeysU2P3,
  ...journeysU2R3,
  ...journeysU2V3,
  ...journeysU2Q1,
];
