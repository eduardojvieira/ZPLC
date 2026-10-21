import { describe, expect, it } from 'bun:test';
import { describeRenderError, folderErrorReason, shouldResetBoundary } from './errorMessages';

const named = (name: string, message = 'details') => Object.assign(new Error(message), { name });

describe('folder error reason', () => {
  it('explains a denied folder in plain words', () => {
    for (const name of ['NotAllowedError', 'SecurityError']) {
      expect(folderErrorReason(named(name))).toBe('Access to the folder was denied. Allow access to the folder and try again.');
    }
  });

  it('explains a missing or locked folder', () => {
    expect(folderErrorReason(named('NotFoundError'))).toBe('The folder, or a file in it, was not found.');
    for (const name of ['NoModificationAllowedError', 'InvalidStateError']) {
      expect(folderErrorReason(named(name))).toBe('The folder is read-only or in use by another program.');
    }
  });

  it('passes through the message of any other error, first line only and bounded', () => {
    expect(folderErrorReason(new Error('A destination file already exists: src/Motor.st'))).toBe(
      'A destination file already exists: src/Motor.st',
    );
    expect(folderErrorReason(new Error('first line\nsecond line'))).toBe('first line');
    expect(folderErrorReason(new Error('x'.repeat(400)))).toBe(`${'x'.repeat(199)}…`);
  });

  it('never returns an empty reason', () => {
    expect(folderErrorReason(new Error(''))).toBe('Unknown error.');
    expect(folderErrorReason('plain text')).toBe('plain text');
    expect(folderErrorReason(undefined)).toBe('Unknown error.');
    expect(folderErrorReason({ code: 5 })).toBe('Unknown error.');
  });
});

describe('render error description', () => {
  it('shows the message of an error and of a thrown string', () => {
    expect(describeRenderError(new TypeError("Cannot read properties of undefined (reading 'length')"))).toBe(
      "Cannot read properties of undefined (reading 'length')",
    );
    expect(describeRenderError('boom')).toBe('boom');
  });

  it('falls back to a generic line for anything else', () => {
    expect(describeRenderError(new Error(''))).toBe('Unexpected error.');
    expect(describeRenderError(null)).toBe('Unexpected error.');
    expect(describeRenderError({ not: 'an error' })).toBe('Unexpected error.');
  });
});

describe('boundary reset', () => {
  it('resets only when the reset key changes', () => {
    expect(shouldResetBoundary('file:a', 'file:a')).toBe(false);
    expect(shouldResetBoundary('file:a', 'file:b')).toBe(true);
    expect(shouldResetBoundary(undefined, undefined)).toBe(false);
    expect(shouldResetBoundary(undefined, 'file:a')).toBe(true);
    expect(shouldResetBoundary(NaN, NaN)).toBe(false);
  });
});
