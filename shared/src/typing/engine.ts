// Authoritative typing engine. Pure data + functions so the same code runs in
// the browser (solo races, client prediction) and on the server (official
// multiplayer scoring).
//
// Model
// -----
// - `lock` is the index before which text is committed. It advances when a
//   correct space is typed with no outstanding errors, so backspace can only
//   edit the current word (and any errors).
// - `entries` holds the characters typed since `lock`.
// - `firstError` is the index inside `entries` of the first mismatch (-1 = none).
//   Every character after the first error is an active (unresolved) error.
// - The typed frontier (`progress`) is lock + correct prefix length; it is the
//   single authoritative text position used for car movement and ranking.
//
// Statistics (documented, used identically everywhere)
// ----------------------------------------------------
// - keystrokes:        every accepted non-backspace character.
// - correctKeystrokes: characters that advanced the frontier.
// - errorKeystrokes:   characters that did not (wrong char, or typed after an
//                      unresolved error). Historical: never decreases.
// - correctedErrors:   error characters removed by backspace.
// - activeErrors:      errors still on screen (= errorKeystrokes - correctedErrors).
// - Accuracy  = correctKeystrokes / (correctKeystrokes + errorKeystrokes) x 100.
//               Corrected errors still count against accuracy.
// - Raw WPM   = (keystrokes / 5) / elapsed minutes.
// - Effective WPM = max(0, (progress / 5) / minutes - PENALTY x activeErrors / minutes).

import { TYPING } from '../constants';

export interface TypingState {
  lock: number;
  entries: string;
  firstError: number;
  keystrokes: number;
  correctKeystrokes: number;
  errorKeystrokes: number;
  correctedErrors: number;
  backspaces: number;
  rejected: number;
  /** Timestamps (ms) of recent frontier advances, for the rolling rate. */
  recent: number[];
  lastInputAt: number;
}

export type TypeResult = 'correct' | 'error' | 'rejected';
export type BackspaceResult = 'corrected' | 'deleted' | 'blocked';

export function createTypingState(): TypingState {
  return {
    lock: 0,
    entries: '',
    firstError: -1,
    keystrokes: 0,
    correctKeystrokes: 0,
    errorKeystrokes: 0,
    correctedErrors: 0,
    backspaces: 0,
    rejected: 0,
    recent: [],
    lastInputAt: 0
  };
}

export function cloneTypingState(s: TypingState): TypingState {
  return { ...s, recent: s.recent.slice() };
}

export function cursorIndex(s: TypingState): number {
  return s.lock + s.entries.length;
}

export function progress(s: TypingState): number {
  return s.lock + (s.firstError === -1 ? s.entries.length : s.firstError);
}

export function activeErrors(s: TypingState): number {
  return s.firstError === -1 ? 0 : s.entries.length - s.firstError;
}

function pruneRecent(s: TypingState, now: number): void {
  const cutoff = now - TYPING.RATE_WINDOW_MS;
  let i = 0;
  while (i < s.recent.length && s.recent[i] < cutoff) i++;
  if (i) s.recent.splice(0, i);
}

/** Only printable single characters are typeable; everything else is ignored. */
export function isTypeableChar(ch: string): boolean {
  if (ch.length !== 1) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x20 && c !== 0x7f;
}

/** Normalise characters produced by smart keyboards so they match ASCII text. */
export function normalizeChar(ch: string): string {
  switch (ch) {
    case '‘':
    case '’':
      return "'";
    case '“':
    case '”':
      return '"';
    case ' ':
      return ' ';
    case '–':
    case '—':
      return '-';
    default:
      return ch;
  }
}

export function typeChar(s: TypingState, text: string, rawCh: string, now: number): TypeResult {
  const ch = normalizeChar(rawCh);
  if (!isTypeableChar(ch)) return 'rejected';
  const idx = cursorIndex(s);
  if (idx >= text.length) return 'rejected'; // caller must extend the passage first
  if (s.firstError !== -1 && s.entries.length - s.firstError >= TYPING.MAX_ERROR_RUN) {
    s.rejected++;
    return 'rejected';
  }
  s.keystrokes++;
  s.lastInputAt = now;
  const matches = text[idx] === ch;
  if (s.firstError === -1 && matches) {
    s.entries += ch;
    s.correctKeystrokes++;
    s.recent.push(now);
    pruneRecent(s, now);
    if (ch === ' ') {
      s.lock += s.entries.length;
      s.entries = '';
    }
    return 'correct';
  }
  if (s.firstError === -1) s.firstError = s.entries.length;
  s.entries += ch;
  s.errorKeystrokes++;
  return 'error';
}

export function backspace(s: TypingState, now: number): BackspaceResult {
  if (s.entries.length === 0) return 'blocked';
  s.backspaces++;
  s.lastInputAt = now;
  const removedIndex = s.entries.length - 1;
  s.entries = s.entries.slice(0, -1);
  if (s.firstError !== -1 && removedIndex >= s.firstError) {
    s.correctedErrors++;
    if (removedIndex === s.firstError) s.firstError = -1;
    return 'corrected';
  }
  // Deleting a correct character pulls the frontier back.
  s.recent.pop();
  return 'deleted';
}

/** Apply an op string: printable chars are typed, '\b' is a backspace. */
export function applyOps(s: TypingState, text: string, ops: string, now: number): { applied: number } {
  let applied = 0;
  for (const ch of ops) {
    if (ch === '\b') {
      if (backspace(s, now) !== 'blocked') applied++;
    } else if (typeChar(s, text, ch, now) !== 'rejected') applied++;
  }
  return { applied };
}

// ---------------------------------------------------------------- statistics

export interface TypingStats {
  rawWpm: number;
  effectiveWpm: number;
  accuracy: number;
  cpm: number;
  progress: number;
  keystrokes: number;
  correctKeystrokes: number;
  errorKeystrokes: number;
  correctedErrors: number;
  uncorrectedErrors: number;
}

function minutes(elapsedMs: number): number {
  return Math.max(TYPING.MIN_ELAPSED_MS, elapsedMs) / 60_000;
}

export function rawWpm(s: TypingState, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return s.keystrokes / TYPING.CHARS_PER_WORD / minutes(elapsedMs);
}

export function effectiveWpm(s: TypingState, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const m = minutes(elapsedMs);
  const net = progress(s) / TYPING.CHARS_PER_WORD / m - (TYPING.UNCORRECTED_PENALTY_WPM * activeErrors(s)) / m;
  return Math.max(0, net);
}

export function accuracy(s: TypingState): number {
  const total = s.correctKeystrokes + s.errorKeystrokes;
  return total === 0 ? 100 : (s.correctKeystrokes / total) * 100;
}

/** Current typing rate in correct characters per second over the rolling window. */
export function currentRateCps(s: TypingState, now: number, raceStart: number): number {
  pruneRecent(s, now);
  const window = Math.min(TYPING.RATE_WINDOW_MS, Math.max(1_000, now - raceStart));
  return (s.recent.length / window) * 1000;
}

export function typingStats(s: TypingState, elapsedMs: number): TypingStats {
  const p = progress(s);
  return {
    rawWpm: rawWpm(s, elapsedMs),
    effectiveWpm: effectiveWpm(s, elapsedMs),
    accuracy: accuracy(s),
    cpm: elapsedMs > 0 ? p / minutes(elapsedMs) : 0,
    progress: p,
    keystrokes: s.keystrokes,
    correctKeystrokes: s.correctKeystrokes,
    errorKeystrokes: s.errorKeystrokes,
    correctedErrors: s.correctedErrors,
    uncorrectedErrors: activeErrors(s)
  };
}
