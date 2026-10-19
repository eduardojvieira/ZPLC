// What a release run did, read from the result of each of its jobs (VF-021): no platform's files reached the draft unless its
// build, with the launch of every installer, succeeded.
import { describe, expect, it } from 'bun:test';
import { checkRunOutcome, type Needs } from './run-outcome';

const ok = { result: 'success' };
const everything = (): Needs => ({
  'validate-version': ok,
  'verify-release-candidate': ok,
  'build-macos': ok, 'build-windows': ok, 'build-linux': ok,
  'prepare-release-evidence-macos': ok, 'prepare-release-evidence-windows': ok, 'prepare-release-evidence-linux': ok,
  'create-draft-release': ok,
  'upload-release-macos': ok, 'upload-release-windows': ok, 'upload-release-linux': ok,
});

describe('the outcome of a release run', () => {
  it('has no finding when every job succeeded', () => {
    expect(checkRunOutcome(everything())).toEqual([]);
  });

  it('accepts a rehearsal, where no draft exists and no upload ran', () => {
    const needs = everything();
    for (const job of ['create-draft-release', 'upload-release-macos', 'upload-release-windows', 'upload-release-linux']) needs[job] = { result: 'skipped' };
    expect(checkRunOutcome(needs)).toEqual([]);
  });

  it('finds files that reached the draft after a build that failed', () => {
    const needs = everything();
    needs['build-windows'] = { result: 'failure' };
    expect(checkRunOutcome(needs)).toEqual(['upload-release-windows ran although build-windows was failure: files reached the draft that were not installed and launched']);
  });

  it('finds files that reached the draft without the evidence of their platform', () => {
    const needs = everything();
    needs['prepare-release-evidence-linux'] = { result: 'skipped' };
    expect(checkRunOutcome(needs)).toEqual(['upload-release-linux ran although prepare-release-evidence-linux was skipped: files reached the draft that no check of the produced files had passed']);
  });

  it('accepts a platform that failed and uploaded nothing', () => {
    const needs = everything();
    needs['build-macos'] = { result: 'failure' };
    needs['prepare-release-evidence-macos'] = { result: 'skipped' };
    needs['upload-release-macos'] = { result: 'skipped' };
    expect(checkRunOutcome(needs)).toEqual([]);
  });
});
