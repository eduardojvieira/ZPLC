import { setDefaultTimeout } from 'bun:test';
import { scaleTime } from './platformTime';

// Preloaded by bunfig.toml: bun's default timeout of a test (5 s) as long as it must be on this system (platformTime.ts).
setDefaultTimeout(scaleTime(5_000));
