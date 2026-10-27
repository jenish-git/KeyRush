// Car progression model: converts typing performance into speed and distance.
//
// Distance is measured in passage characters. The car chases the player's
// typed frontier: its target speed comes from the rolling typing rate, reduced
// by unresolved errors, with a capped catch-up boost when it lags behind. The
// car can never pass the frontier. Errors slow the car; a sustained critical
// error state (or too many errors at once) crashes it, stopping it briefly.
// Lost ground after a crash is only recovered gradually, so mistakes have a
// lasting cost without ever erasing completed typing.
//
// All functions are deterministic for a fixed step size (RACING.STEP_MS).

import { RACING } from '../constants';
import { activeErrors, currentRateCps, progress, type TypingState } from '../typing/engine';

export type CarStatus = 'grid' | 'running' | 'slowed' | 'critical' | 'crashed' | 'recovering';

export interface CarState {
  distance: number;
  speed: number;
  status: CarStatus;
  crashes: number;
  crashedUntil: number;
  lastCrashAt: number;
  criticalSince: number;
  recoveringUntil: number;
}

export function createCarState(): CarState {
  return {
    distance: 0,
    speed: 0,
    status: 'grid',
    crashes: 0,
    crashedUntil: 0,
    lastCrashAt: -Infinity,
    criticalSince: -1,
    recoveringUntil: 0
  };
}

export function targetSpeed(car: CarState, typing: TypingState, now: number, raceStart: number): number {
  const rate = currentRateCps(typing, now, raceStart);
  const errs = activeErrors(typing);
  const errFactor = Math.pow(RACING.ERROR_SLOWDOWN, errs);
  const lag = progress(typing) - car.distance;
  const catchUp = 1 + (RACING.MAX_CATCHUP - 1) * Math.min(1, Math.max(0, lag) / RACING.CATCHUP_CHARS);
  let target = rate * errFactor * catchUp;
  // A clean car that is behind its frontier always creeps forward.
  if (errs === 0 && lag > 0.5) target = Math.max(target, 1);
  return target;
}

/**
 * Advance one simulation step. `now` is the time at the end of the step.
 * Returns 'crash' when a crash starts during this step.
 */
export function stepCar(
  car: CarState,
  typing: TypingState,
  now: number,
  dtMs: number,
  raceStart: number
): 'crash' | null {
  const dt = dtMs / 1000;
  const errs = activeErrors(typing);
  let event: 'crash' | null = null;

  // Critical-state tracking.
  if (errs >= RACING.CRITICAL_ERRORS) {
    if (car.criticalSince < 0) car.criticalSince = now;
  } else {
    car.criticalSince = -1;
  }

  const canCrash = now >= car.crashedUntil && now - car.lastCrashAt >= RACING.CRASH_COOLDOWN_MS + RACING.CRASH_STOP_MS;
  const sustained = car.criticalSince >= 0 && now - car.criticalSince >= RACING.CRITICAL_CRASH_MS;
  if (canCrash && (errs >= RACING.CRASH_ERRORS || sustained)) {
    car.crashes++;
    car.lastCrashAt = now;
    car.crashedUntil = now + RACING.CRASH_STOP_MS;
    car.recoveringUntil = car.crashedUntil + 2_500;
    car.criticalSince = -1;
    car.speed = 0;
    event = 'crash';
  }

  if (now < car.crashedUntil) {
    car.speed = 0;
    car.status = 'crashed';
    return event;
  }

  const target = targetSpeed(car, typing, now, raceStart);
  const recovering = now < car.recoveringUntil;
  const tau = recovering ? RACING.RECOVERY_TAU_S : RACING.ACCEL_TAU_S;
  car.speed += (target - car.speed) * (1 - Math.exp(-dt / tau));
  if (car.speed < 0.01) car.speed = 0;

  const frontier = progress(typing);
  car.distance = Math.min(frontier, car.distance + car.speed * dt);
  if (car.distance >= frontier && car.speed > target) car.speed = target;

  if (recovering) car.status = 'recovering';
  else if (errs >= RACING.CRITICAL_ERRORS) car.status = 'critical';
  else if (errs > 0) car.status = 'slowed';
  else car.status = car.speed > 0 || car.distance > 0 ? 'running' : 'grid';
  return event;
}

/** Characters per second -> a broadcast-style km/h figure for the HUD. */
export function speedKmh(cps: number): number {
  return Math.round(cps * 22);
}
