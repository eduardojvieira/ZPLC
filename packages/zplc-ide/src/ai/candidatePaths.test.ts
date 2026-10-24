import { describe, expect, test } from 'bun:test';
import {
  CANDIDATE_CHANGE_CAP,
  candidateLanguageOf,
  isCandidateChangePath,
  isCandidateSourcePath,
  isCandidateSourcePathPattern,
} from './candidatePaths';

describe('the paths an assistant may read and propose (IDE-030)', () => {
  test('a program in any of the five languages directly in src is a candidate source', () => {
    for (const path of ['src/Main.st', 'src/Main.il', 'src/Main.ld.json', 'src/Main.fbd.json', 'src/Main.sfc.json'])
      expect(isCandidateSourcePath(path), path).toBe(true);
    expect(candidateLanguageOf('src/Main.st')).toBe('ST');
    expect(candidateLanguageOf('src/Main.il')).toBe('IL');
    expect(candidateLanguageOf('src/Main.ld.json')).toBe('LD');
    expect(candidateLanguageOf('src/Main.fbd.json')).toBe('FBD');
    expect(candidateLanguageOf('src/Main.sfc.json')).toBe('SFC');
  });

  test('nothing else is: other folders, other extensions, separators, control characters and long names', () => {
    for (const path of [
      'Main.st',
      'src/sub/Main.st',
      'lib/Main.st',
      'src/Main.gvl',
      'src/Main.ld',
      'src/Main.json',
      'src/Main.st.bak',
      'src/..\\Main.st',
      'src/Ma\nin.st',
      'src/Ma\0in.st',
      '/src/Main.st',
      `src/${'a'.repeat(600)}.st`,
      'zplc.json',
    ])
      expect(isCandidateSourcePath(path), JSON.stringify(path)).toBe(false);
    expect(candidateLanguageOf('src/Main.gvl')).toBeUndefined();
  });

  test('a change may also name the manifest, and the cap on the files of one change set is small', () => {
    expect(isCandidateChangePath('zplc.json')).toBe(true);
    expect(isCandidateChangePath('src/Main.fbd.json')).toBe(true);
    expect(isCandidateChangePath('tests/a.scenario.json')).toBe(false);
    expect(isCandidateChangePath('src/zplc.json')).toBe(false);
    expect(CANDIDATE_CHANGE_CAP).toBe(4);
    expect(isCandidateSourcePathPattern.test('src/A.st')).toBe(true);
  });
});
