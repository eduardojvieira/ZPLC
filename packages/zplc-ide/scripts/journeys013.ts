/**
 * The journeys of lane W (spec 013), one file per task so that the lane's writers never edit the same file. `journeys.ts`
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

export const JOURNEYS_013: Journey[] = [
  ...journeysW2,
  ...journeysW3,
  ...journeysW4,
  ...journeysW6,
  ...journeysW7,
  ...journeysW8,
  ...journeysW9,
];
