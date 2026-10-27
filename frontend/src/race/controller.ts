// Race controllers give the race screen one interface for both modes:
// - SoloRace runs the shared RaceSim locally (player + bots).
// - NetRace predicts the local player's typing and follows the server's
//   authoritative standings, timer and results.

import {
  applyOps,
  BOT_NAMES,
  buildPassage,
  CARS,
  cloneTypingState,
  createBotProfiles,
  createRng,
  createTypingState,
  cursorIndex,
  NET,
  RaceSim,
  scheduleStart,
  shuffle,
  START_LIGHTS,
  type Difficulty,
  type RaceResult,
  type RaceSetup,
  type RaceSummary,
  type RacerInfo,
  type RacerSnapshot,
  type SelfState,
  type Theme,
  type TypingState
} from '@shared/index';
import type { Socket } from 'socket.io-client';

export type RaceEvent =
  | { type: 'crash'; playerId: string }
  | { type: 'false-start'; playerId: string }
  | { type: 'finished' };

export interface StandingsSnapshot {
  racers: RacerSnapshot[];
  /** Race-clock time at which the snapshot was valid. */
  at: number;
}

export abstract class RaceController {
  abstract readonly mode: 'solo' | 'multiplayer';
  abstract readonly selfId: string;
  abstract readonly racers: RacerInfo[];
  abstract readonly lightsAt: number[];
  abstract readonly startAt: number;
  abstract readonly endAt: number;
  abstract readonly durationMs: number;
  abstract text: string;
  abstract typing: TypingState;
  abstract falseStart: boolean;
  abstract lockedUntil: number;
  summary: RaceSummary | null = null;
  reactionMs: number | null = null;
  paused = false;
  /** Increments whenever text or local typing changes. */
  version = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: RaceEvent) => void>();

  abstract now(): number;
  abstract snapshot(): StandingsSnapshot;
  abstract handleOps(ops: string): void;
  abstract dispose(): void;
  get canPause() {
    return false;
  }
  pause() {}
  resume() {}

  get finished() {
    return this.summary !== null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onEvent(fn: (e: RaceEvent) => void) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }
  protected changed() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  protected emit(e: RaceEvent) {
    this.eventListeners.forEach((l) => l(e));
  }
  protected noteReaction(now: number) {
    if (this.reactionMs === null && now >= this.startAt) this.reactionMs = now - this.startAt;
  }
}

// ------------------------------------------------------------------ solo

export interface SoloOptions {
  name: string;
  carId: string;
  durationMin: number;
  bots: number;
  difficulty: Difficulty;
  avoidThemes: Theme[];
}

export class SoloRace extends RaceController {
  readonly mode = 'solo' as const;
  readonly selfId = 'you';
  readonly racers: RacerInfo[];
  readonly lightsAt: number[];
  readonly startAt: number;
  readonly endAt: number;
  readonly durationMs: number;
  readonly sim: RaceSim;
  readonly themes: Theme[];
  private pausedTotal = 0;
  private pausedAt = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(private opts: SoloOptions, private onFinish: (s: RaceSummary) => void) {
    super();
    const seed = (Math.random() * 2 ** 31) | 0;
    const stream = buildPassage(seed, opts.durationMin, { avoidThemes: opts.avoidThemes });
    this.themes = stream.themesUsed.slice(0, 3);
    const { lightsAt, startAt } = scheduleStart(Date.now(), Math.random());
    this.lightsAt = lightsAt;
    this.sim = new RaceSim(`solo-${seed}-${Date.now()}`, stream, startAt, opts.durationMin * 60_000);
    this.startAt = startAt;
    this.endAt = this.sim.endAt;
    this.durationMs = this.sim.durationMs;

    const rng = createRng(seed);
    const names = shuffle(rng, BOT_NAMES);
    const cars = shuffle(rng, CARS.filter((c) => c.id !== opts.carId));
    this.sim.addRacer({ id: this.selfId, name: opts.name, carId: opts.carId, isBot: false });
    createBotProfiles(opts.difficulty, opts.bots, seed).forEach((profile, i) => {
      this.sim.addRacer(
        { id: `bot-${i}`, name: names[i % names.length], carId: cars[i % cars.length].id, isBot: true },
        { profile, seed: seed + i * 7919 }
      );
    });
    this.racers = [...this.sim.racers.values()].map((r) => r.info);
    this.timer = setInterval(() => this.tick(), 50);
  }

  get text() {
    return this.sim.text;
  }
  private get self() {
    return this.sim.racers.get(this.selfId)!;
  }
  get typing() {
    return this.self.typing;
  }
  get falseStart() {
    return this.self.falseStart;
  }
  get lockedUntil() {
    return this.self.lockedUntil;
  }
  override get canPause() {
    return !this.finished;
  }

  now() {
    return (this.paused ? this.pausedAt : Date.now()) - this.pausedTotal;
  }

  override pause() {
    if (this.paused || this.finished) return;
    this.pausedAt = Date.now();
    this.paused = true;
    this.changed();
  }
  override resume() {
    if (!this.paused) return;
    this.pausedTotal += Date.now() - this.pausedAt;
    this.paused = false;
    this.changed();
  }

  private tick() {
    if (this.paused || this.finished) return;
    const ev = this.sim.tick(this.now());
    ev.crashes.forEach((id) => this.emit({ type: 'crash', playerId: id }));
    if (ev.extended) this.changed();
    if (ev.finished) this.finish();
  }

  private finish() {
    clearInterval(this.timer);
    this.summary = {
      raceId: this.sim.raceId,
      mode: 'solo',
      difficulty: this.opts.difficulty,
      durationMin: this.opts.durationMin,
      startedAt: Date.now() - this.durationMs,
      results: this.sim.results()
    };
    this.emit({ type: 'finished' });
    this.changed();
    this.onFinish(this.summary);
  }

  snapshot(): StandingsSnapshot {
    const now = this.now();
    return { racers: this.sim.snapshot(now), at: now };
  }

  handleOps(ops: string) {
    if (this.paused || this.finished) return;
    const now = this.now();
    const wasFalse = this.self.falseStart;
    const res = this.sim.input(this.selfId, ops, now);
    if (!res.ok && res.reason === 'false-start' && !wasFalse) this.emit({ type: 'false-start', playerId: this.selfId });
    if (res.ok && res.applied) this.noteReaction(now);
    this.tick();
    this.changed();
  }

  dispose() {
    clearInterval(this.timer);
  }
}

// ------------------------------------------------------------- multiplayer

type ClientSocket = Socket<any, any>;

export class NetRace extends RaceController {
  readonly mode = 'multiplayer' as const;
  readonly racers: RacerInfo[];
  readonly lightsAt: number[];
  readonly startAt: number;
  readonly endAt: number;
  readonly durationMs: number;
  readonly raceId: string;
  text: string;
  typing: TypingState = createTypingState();
  falseStart = false;
  lockedUntil = 0;
  private seq = 0;
  private queue = '';
  /** Batches sent but not yet confirmed by an authoritative self-state. */
  private pending: { seq: number; ops: string }[] = [];
  private latest: StandingsSnapshot = { racers: [], at: 0 };
  private flushTimer: ReturnType<typeof setInterval>;

  constructor(
    setup: RaceSetup,
    readonly selfId: string,
    private socket: ClientSocket,
    private clockOffset: () => number
  ) {
    super();
    this.raceId = setup.raceId;
    this.racers = setup.racers;
    this.lightsAt = setup.lightsAt;
    this.startAt = setup.startAt;
    this.endAt = setup.endAt;
    this.durationMs = setup.durationMs;
    this.text = setup.text;
    this.latest = {
      at: this.now(),
      racers: setup.racers.map((r) => ({
        id: r.id, distance: 0, speed: 0, carStatus: 'grid', effectiveWpm: 0, accuracy: 100,
        progress: 0, crashes: 0, falseStart: false, status: 'racing'
      }))
    };
    this.flushTimer = setInterval(() => this.flush(), 40);
  }

  now() {
    return Date.now() + this.clockOffset();
  }

  /** Called when a reconnect delivers the setup again. */
  updateText(text: string) {
    if (text.length > this.text.length && text.startsWith(this.text)) {
      this.text = text;
      this.changed();
    }
  }

  extend(from: number, text: string) {
    if (from === this.text.length) this.text += text;
    else if (from < this.text.length && from + text.length > this.text.length) this.text = this.text.slice(0, from) + text;
    else if (from > this.text.length) this.socket.emit('race:request-state');
    this.changed();
  }

  applyState(serverNow: number, racers: RacerSnapshot[]) {
    this.latest = { racers, at: serverNow };
  }

  applySelf(self: SelfState) {
    this.pending = this.pending.filter((p) => p.seq > self.lastSeq);
    this.typing = cloneTypingState(self.typing);
    this.seq = Math.max(self.lastSeq, this.pending.length ? this.pending[this.pending.length - 1].seq : 0);
    // Replay inputs the server has not processed yet (client-side prediction).
    for (const p of this.pending) applyOps(this.typing, this.text, p.ops, this.now());
    if (this.queue) applyOps(this.typing, this.text, this.queue, this.now());
    this.falseStart = self.falseStart;
    this.lockedUntil = self.lockedUntil;
    this.changed();
  }

  serverEvent(e: RaceEvent) {
    this.emit(e);
  }

  finish(summary: RaceSummary) {
    this.flush();
    clearInterval(this.flushTimer);
    this.summary = summary;
    this.emit({ type: 'finished' });
    this.changed();
  }

  snapshot() {
    return this.latest;
  }

  handleOps(ops: string) {
    if (this.finished) return;
    const now = this.now();
    if (now < this.startAt) {
      // Jump start: the server judges it officially; mirror the penalty locally.
      if (!this.falseStart) this.emit({ type: 'false-start', playerId: this.selfId });
      this.falseStart = true;
      this.lockedUntil = this.startAt + START_LIGHTS.FALSE_START_PENALTY_MS;
      this.queue += ops.slice(0, 1);
      this.flush();
      this.changed();
      return;
    }
    if (now < this.lockedUntil || now >= this.endAt) return;
    let accepted = '';
    for (const ch of ops) {
      if (ch !== '\b' && cursorIndex(this.typing) >= this.text.length) {
        this.socket.emit('race:request-state');
        break;
      }
      if (applyOps(this.typing, this.text, ch, now).applied) accepted += ch;
    }
    if (accepted) {
      this.noteReaction(now);
      this.queue += accepted;
      if (this.queue.length >= 32) this.flush();
    }
    this.changed();
  }

  private flush() {
    while (this.queue.length) {
      const ops = this.queue.slice(0, NET.MAX_OPS_PER_MESSAGE);
      this.queue = this.queue.slice(ops.length);
      const seq = ++this.seq;
      this.pending.push({ seq, ops });
      if (this.pending.length > 400) this.pending.shift();
      this.socket.emit('race:input', { seq, ops });
    }
  }

  dispose() {
    clearInterval(this.flushTimer);
  }
}

export function resultsFor(summary: RaceSummary | null, id: string): RaceResult | undefined {
  return summary?.results.find((r) => r.id === id);
}
