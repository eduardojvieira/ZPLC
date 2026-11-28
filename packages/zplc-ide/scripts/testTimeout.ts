// Prints the default timeout of a unit test in ms for this system: `bun test --timeout $(bun scripts/testTimeout.ts)` (package.json).
// A bunfig preload would not do: bun applies its setDefaultTimeout to the first test file of a process only, --timeout to all.
// ZPLC_TEST_PLATFORM names another platform (the proof that the scaling reaches every file).
import { scaleTime } from '../src/test/platformTime';

console.log(scaleTime(5_000, process.env.ZPLC_TEST_PLATFORM || process.platform));
