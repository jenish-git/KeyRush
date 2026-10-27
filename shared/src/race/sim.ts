// RaceSim: the complete rules of a race (timing, typing, cars, bots, ranking).
// The server runs one per multiplayer race and is the only authority there.
// Solo races run the very same class in the browser, so bots and players are
// always judged by identical rules.

import { NET, PASSAGE, RACING, START_LIGHTS } from '../constants';
import { BotDriver, type BotProfile } from '../bots/bot';
import { createCarState, stepCar, type CarState } from '../racing/car';
import { PassageStream } from '../passages/generator';
import { rank } from '../scoring/ranking';
import {
  applyOps,
  createTypingState,
  cursorIndex,
  progress,
  typingStats,
  type TypingState
} from '../typing/engine';
import type { RaceResult, RacerInfo, RacerSnapshot, RacerStatus } from '../types';

export interface SimRacer {
  info: RacerInfo;
  typing: TypingState;
  car: CarState;
  bot?: BotDriver;
  falseStart: boolean;
  lockedUntil: number;
  status: RacerStatus;
}

export type InputOutcome =
  | { ok: true; applied: number }
  | { ok: false; reason: 'false-start' | 'penalty' | 'finished' | 'unknown-racer' | 'invalid' };

export interface TickEvents {
  crashes: string[];
  extended: { from: number; text: string } | null;
  finished: boolean;
}

/** Build a lights schedule: five lights one second apart, then a random hold. */
export function scheduleStart(now: number, holdRandom01: number) {
  const firstLight = now + START_LIGHTS.LEAD_IN_MS;
  const lightsAt = Array.from({ length: START_LIGHTS.COUNT }, (_, i) => firstLight + i * START_LIGHTS.LIGHT_INTERVAL_MS);
  const hold = START_LIGHTS.MIN_HOLD_MS + holdRandom01 * (START_LIGHTS.MAX_HOLD_MS - START_LIGHTS.MIN_HOLD_MS);
  const startAt = Math.round(lightsAt[lightsAt.length - 1] + START_LIGHTS.LIGHT_INTERVAL_MS + hold);
  return { lightsAt, startAt };
}

export class RaceSim {
  readonly racers = new Map<string, SimRacer>();
  readonly endAt: number;
  private lastStep: number;
  finished = false;
  private pendingExtension: { from: number; text: string } | null = null;

  constructor(
    readonly raceId: string,
    readonly stream: PassageStream,
    readonly startAt: number,
    readonly durationMs: number
  ) {
    // Align the race length to whole simulation steps so it ends exactly on endAt.
    this.durationMs = Math.ceil(durationMs / RACING.STEP_MS) * RACING.STEP_MS;
    this.endAt = startAt + this.durationMs;
    this.lastStep = startAt;
  }

  get text(): string {
    return this.stream.text;
  }

  addRacer(info: RacerInfo, bot?: { profile: BotProfile; seed: number }): SimRacer {
    const racer: SimRacer = {
      info,
      typing: createTypingState(),
      car: createCarState(),
      bot: bot ? new BotDriver(bot.profile, bot.seed, this.startAt) : undefined,
      falseStart: false,
      lockedUntil: 0,
      status: 'racing'
    };
    this.racers.set(info.id, racer);
    return racer;
  }

  /** Make sure the passage reaches at least `index + EXTEND_THRESHOLD` characters. */
  private ensureText(index: number): void {
    const need = index + PASSAGE.EXTEND_THRESHOLD;
    if (this.stream.text.length >= need) return;
    const from = this.stream.text.length;
    const added = this.stream.ensureLength(need + PASSAGE.SEGMENT_CHARS);
    if (this.pendingExtension) this.pendingExtension.text += added;
    else this.pendingExtension = { from, text: added };
  }

  /** Apply a player's input received at `now`. Advances the simulation first. */
  input(id: string, ops: string, now: number): InputOutcome {
    const racer = this.racers.get(id);
    if (!racer || racer.bot) return { ok: false, reason: 'unknown-racer' };
    if (ops.length === 0 || ops.length > NET.MAX_OPS_PER_MESSAGE) return { ok: false, reason: 'invalid' };
    if (now < this.startAt) {
      racer.falseStart = true;
      racer.lockedUntil = this.startAt + START_LIGHTS.FALSE_START_PENALTY_MS;
      return { ok: false, reason: 'false-start' };
    }
    this.tick(now);
    if (this.finished || now >= this.endAt) return { ok: false, reason: 'finished' };
    if (now < racer.lockedUntil) return { ok: false, reason: 'penalty' };
    let applied = 0;
    for (const ch of ops) {
      this.ensureText(cursorIndex(racer.typing) + 1);
      applied += applyOps(racer.typing, this.text, ch, now).applied;
    }
    return { ok: true, applied };
  }

  /** Advance in fixed steps up to `now` (capped at the end of the race). */
  tick(now: number): TickEvents {
    const events: TickEvents = { crashes: [], extended: null, finished: false };
    if (this.finished) return events;
    const until = Math.min(now, this.endAt);
    while (this.lastStep + RACING.STEP_MS <= until) {
      const t = this.lastStep + RACING.STEP_MS;
      for (const r of this.racers.values()) {
        if (r.bot) {
          this.ensureText(cursorIndex(r.typing) + 1);
          r.bot.advance(r.typing, this.text, t);
        }
      }
      for (const r of this.racers.values()) {
        if (stepCar(r.car, r.typing, t, RACING.STEP_MS, this.startAt) === 'crash') events.crashes.push(r.info.id);
      }
      this.lastStep = t;
    }
    if (this.lastStep >= this.endAt) {
      this.finished = true;
      events.finished = true;
    }
    events.extended = this.pendingExtension;
    this.pendingExtension = null;
    return events;
  }

  private elapsed(now: number): number {
    return Math.max(0, Math.min(now, this.endAt) - this.startAt);
  }

  snapshot(now: number): RacerSnapshot[] {
    const elapsed = this.elapsed(now);
    const list: RacerSnapshot[] = [];
    for (const r of this.racers.values()) {
      const s = typingStats(r.typing, elapsed);
      list.push({
        id: r.info.id,
        distance: r.car.distance,
        speed: r.car.speed,
        carStatus: r.car.status,
        effectiveWpm: s.effectiveWpm,
        accuracy: s.accuracy,
        progress: progress(r.typing),
        crashes: r.car.crashes,
        falseStart: r.falseStart,
        status: r.status
      });
    }
    return rank(list);
  }

  results(): RaceResult[] {
    const elapsed = this.durationMs;
    const rows = [...this.racers.values()].map((r) => {
      const s = typingStats(r.typing, elapsed);
      return {
        position: 0,
        id: r.info.id,
        name: r.info.name,
        carId: r.info.carId,
        isBot: r.info.isBot,
        effectiveWpm: round1(s.effectiveWpm),
        rawWpm: round1(s.rawWpm),
        accuracy: round1(s.accuracy),
        correctChars: s.correctKeystrokes,
        totalErrors: s.errorKeystrokes,
        correctedErrors: s.correctedErrors,
        uncorrectedErrors: s.uncorrectedErrors,
        distance: Math.round(r.car.distance * 1000) / 1000,
        crashes: r.car.crashes,
        falseStart: r.falseStart,
        status: r.status,
        raceTimeMs: elapsed
      } satisfies RaceResult;
    });
    return rank(rows).map((row, i) => ({ ...row, position: i + 1 }));
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
