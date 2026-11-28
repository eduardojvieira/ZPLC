import type { Journey } from '../journeys';
import { journeysJrn005Assistant } from './jrn005Assistant';
import { journeysJrn005Mcp } from './jrn005Mcp';

/** The journeys of spec 014 (release quality): the automated golden journeys of JRN-005. */
export const JOURNEYS_014: Journey[] = [...journeysJrn005Assistant, ...journeysJrn005Mcp];
