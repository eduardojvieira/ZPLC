import { describe, it } from 'bun:test';

// PLT-017: one scene and script give the same trace hash graded (S1 seam, `scenarioStep` virtual clock) and live
// (`createPlantSession` of contract C6 over the native runtime with `paceMs: async () => {}`). `createPlantSession` is
// Task R3, not merged on this branch: the test stays a todo until it is, then runs the fixture scene of sceneCheck.test.ts
// both ways, skipped with a printed reason when the native runtime binary is absent (as the lesson tests do).
describe('live versus graded', () => {
  it.todo('PLT-017 one scene and script give the same trace live and graded (needs R3 createPlantSession, contract C6)');
});
