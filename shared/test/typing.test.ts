import { describe, expect, it } from 'vitest';
import {
  accuracy,
  activeErrors,
  applyOps,
  backspace,
  createTypingState,
  cursorIndex,
  effectiveWpm,
  progress,
  rawWpm,
  typeChar,
  TYPING
} from '../src/index';

const TEXT = 'the quick brown fox jumps over the lazy dog';

describe('typing engine', () => {
  it('advances progress exactly once per correct character', () => {
    const s = createTypingState();
    expect(typeChar(s, TEXT, 't', 1)).toBe('correct');
    expect(progress(s)).toBe(1);
    expect(typeChar(s, TEXT, 'h', 2)).toBe('correct');
    expect(progress(s)).toBe(2);
    expect(s.correctKeystrokes).toBe(2);
  });

  it('marks an incorrect character as an active error without advancing progress', () => {
    const s = createTypingState();
    typeChar(s, TEXT, 't', 1);
    expect(typeChar(s, TEXT, 'x', 2)).toBe('error');
    expect(progress(s)).toBe(1);
    expect(activeErrors(s)).toBe(1);
    expect(cursorIndex(s)).toBe(2);
  });

  it('every character after an unresolved error is an error, even if it matches', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'tx', 0);
    expect(typeChar(s, TEXT, 'e', 1)).toBe('error');
    expect(activeErrors(s)).toBe(2);
    expect(progress(s)).toBe(1);
  });

  it('backspace correction clears the active mistake but keeps history', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'tx', 0);
    expect(backspace(s, 1)).toBe('corrected');
    expect(activeErrors(s)).toBe(0);
    expect(s.errorKeystrokes).toBe(1);
    expect(s.correctedErrors).toBe(1);
    typeChar(s, TEXT, 'h', 2);
    expect(progress(s)).toBe(2);
    expect(accuracy(s)).toBeCloseTo((2 / 3) * 100);
  });

  it('keeps errorKeystrokes = correctedErrors + activeErrors', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'thx qq\b\bq', 0);
    expect(s.errorKeystrokes).toBe(s.correctedErrors + activeErrors(s));
  });

  it('commits words on a correct space so backspace cannot go back into them', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'the ', 0);
    expect(s.lock).toBe(4);
    expect(backspace(s, 1)).toBe('blocked');
    expect(progress(s)).toBe(4);
  });

  it('a held key cannot generate unlimited errors or progress', () => {
    const s = createTypingState();
    for (let i = 0; i < 200; i++) typeChar(s, TEXT, 'z', i);
    expect(progress(s)).toBe(0);
    expect(activeErrors(s)).toBe(TYPING.MAX_ERROR_RUN);
    expect(s.rejected).toBe(200 - TYPING.MAX_ERROR_RUN);
  });

  it('rejects input beyond the end of the available text', () => {
    const s = createTypingState();
    applyOps(s, 'ab', 'ab', 0);
    expect(typeChar(s, 'ab', 'c', 1)).toBe('rejected');
    // After the passage is extended the same input is accepted.
    expect(typeChar(s, 'ab cd', ' ', 2)).toBe('correct');
  });

  it('never produces infinite WPM at zero elapsed time', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'the', 0);
    expect(rawWpm(s, 0)).toBe(0);
    expect(effectiveWpm(s, 0)).toBe(0);
    expect(Number.isFinite(rawWpm(s, 1))).toBe(true);
  });

  it('computes WPM with the documented formulas', () => {
    const s = createTypingState();
    applyOps(s, TEXT, 'the quick ', 0); // 10 correct chars
    expect(rawWpm(s, 60_000)).toBeCloseTo(2);
    expect(effectiveWpm(s, 60_000)).toBeCloseTo(2);
    applyOps(s, TEXT, 'x', 0); // one uncorrected error
    expect(rawWpm(s, 60_000)).toBeCloseTo(11 / 5);
    expect(effectiveWpm(s, 60_000)).toBeCloseTo(2 - TYPING.UNCORRECTED_PENALTY_WPM);
  });

  it('normalises smart punctuation from mobile keyboards', () => {
    const s = createTypingState();
    expect(typeChar(s, "it's", 'i', 0)).toBe('correct');
    typeChar(s, "it's", 't', 0);
    expect(typeChar(s, "it's", '’', 0)).toBe('correct');
  });

  it('ignores control characters and multi-character strings', () => {
    const s = createTypingState();
    expect(typeChar(s, TEXT, '\t', 0)).toBe('rejected');
    expect(typeChar(s, TEXT, 'th', 0)).toBe('rejected');
    expect(s.keystrokes).toBe(0);
  });
});
