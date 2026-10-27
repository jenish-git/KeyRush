// Central, shared game configuration. Frontend and backend both import these
// values, so the HUD, the server and the results screen always agree.

export const RACE_DURATIONS_MIN = [1, 3, 5, 10, 15] as const;
export type RaceDurationMin = (typeof RACE_DURATIONS_MIN)[number];

export const ROOM = {
  CODE_LENGTH: 5,
  // No 0/O, 1/I/L to avoid ambiguity when read aloud or copied by hand.
  CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  MIN_PLAYERS: 2,
  MAX_PLAYERS_LIMIT: 8,
  DEFAULT_MAX_PLAYERS: 6,
  NAME_MAX: 16,
  LOBBY_GRACE_MS: 30_000,
  RACE_GRACE_MS: 60_000,
  FINISHED_ROOM_TTL_MS: 15 * 60_000
} as const;

export const TYPING = {
  /** Max characters that can be typed past the first uncorrected error. */
  MAX_ERROR_RUN: 8,
  /** Effective WPM loses this many words per minute per uncorrected error. */
  UNCORRECTED_PENALTY_WPM: 1,
  /** Rolling window used for the "current" typing rate. */
  RATE_WINDOW_MS: 5_000,
  /** Characters per word used by every WPM formula. */
  CHARS_PER_WORD: 5,
  /** Minimum elapsed time used as a denominator so WPM never explodes. */
  MIN_ELAPSED_MS: 1_000
} as const;

export const RACING = {
  /** Fixed simulation step. Rendering interpolates between steps. */
  STEP_MS: 50,
  /** Speed smoothing time constant (seconds). */
  ACCEL_TAU_S: 0.6,
  /** Slower time constant used while recovering from a crash. */
  RECOVERY_TAU_S: 1.6,
  /** Each active error multiplies target speed by this factor. */
  ERROR_SLOWDOWN: 0.62,
  /** Active errors at which the car is in a critical state. */
  CRITICAL_ERRORS: 3,
  /** Active errors that cause an immediate crash. */
  CRASH_ERRORS: 6,
  /** A critical state lasting this long causes a crash. */
  CRITICAL_CRASH_MS: 2_500,
  /** Duration the car is stopped after a crash. */
  CRASH_STOP_MS: 1_600,
  /** After a crash, you must clear errors to resume; cooldown before another crash. */
  CRASH_COOLDOWN_MS: 3_000,
  /** Catch-up boost when the car lags behind the typed frontier (max multiplier). */
  MAX_CATCHUP: 1.5,
  CATCHUP_CHARS: 40
} as const;

export const START_LIGHTS = {
  COUNT: 5,
  /** Delay between the countdown being scheduled and the first light. */
  LEAD_IN_MS: 1_500,
  LIGHT_INTERVAL_MS: 1_000,
  /** Random hold after the 5th light before lights out. */
  MIN_HOLD_MS: 400,
  MAX_HOLD_MS: 2_600,
  /** Input lockout after lights out for a jump start. */
  FALSE_START_PENALTY_MS: 2_000
} as const;

export const PASSAGE = {
  EXPECTED_WPM: 60,
  SAFETY_MARGIN: 1.25,
  /** When a racer is this close to the end, the next segment is appended. */
  EXTEND_THRESHOLD: 600,
  SEGMENT_CHARS: 1_200,
  MIN_CHARS: 600
} as const;

export const NET = {
  STATE_BROADCAST_MS: 100,
  MAX_OPS_PER_MESSAGE: 64,
  /** Token-bucket input limit (characters per second, with burst). */
  INPUT_RATE_CPS: 30,
  INPUT_BURST: 60,
  CREATE_ROOM_PER_MIN: 6
} as const;

export const BOT_LIMITS = { MIN: 1, MAX: 9 } as const;
