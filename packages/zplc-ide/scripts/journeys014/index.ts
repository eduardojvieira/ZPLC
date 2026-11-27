import type { Journey } from '../journeys';
import { journeysJrn005Mcp } from './jrn005Mcp';

// jrn005Assistant.ts (journey 4) is written but not listed: with no usable OS vault the Assistant is never offered, even for a
// key-free loopback endpoint (presentAiProviderStatus wants vaultAvailable), so it cannot pass on a headless Linux host.
/** The journeys of spec 014 (release quality): the automated golden journeys of JRN-005. */
export const JOURNEYS_014: Journey[] = [...journeysJrn005Mcp];
