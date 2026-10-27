import { describe, expect, it } from 'vitest';
import {
  buildPassage,
  compareRacers,
  createBotProfiles,
  createCarState,
  createTypingState,
  estimateRequiredChars,
  PassageStream,
  RaceSim,
  RACING,
  rank,
  scheduleStart,
  START_LIGHTS,
  stepCar,
  typeChar
} from '../src/index';

/** Simulate a human typing perfectly at `wpm` for `ms`, stepping the car. */
function driveCar(wpm: number, ms: number, opts: { errorsAt?: number[]; fixErrors?: boolean } = {}) {
  const text = buildPassage(1, 3).text;
  const typing = createTypingState();
  const car = createCarState();
  const interval = 60_000 / (wpm * 5);
  let nextKey = interval;
  let crashes = 0;
  let keyCount = 0;
  for (let t = RACING.STEP_MS; t <= ms; t += RACING.STEP_MS) {
    while (nextKey <= t) {
      keyCount++;
      if (opts.errorsAt?.includes(keyCount)) {
        for (let k = 0; k < 7; k++) typeChar(typing, text, '#', nextKey);
      } else if (typing.firstError === -1 || !opts.fixErrors) {
        const idx = typing.lock + typing.entries.length;
        typeChar(typing, text, text[idx], nextKey);
      } else {
        typing.entries = typing.entries.slice(0, typing.firstError);
        typing.correctedErrors += 7;
        typing.firstError = -1;
      }
      nextKey += interval;
    }
    if (stepCar(car, typing, t, RACING.STEP_MS, 0) === 'crash') crashes++;
  }
  return { car, typing, crashes };
}

describe('passage generation', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    expect(buildPassage(42, 5).text).toBe(buildPassage(42, 5).text);
    expect(buildPassage(42, 5).text).not.toBe(buildPassage(43, 5).text);
  });

  it('produces duration-aware lengths', () => {
    expect(estimateRequiredChars(5)).toBe(60 * 5 * 5 * 1.25);
    const short = buildPassage(7, 1).text.length;
    const long = buildPassage(7, 15).text.length;
    expect(short).toBeGreaterThanOrEqual(estimateRequiredChars(1));
    expect(long).toBeGreaterThanOrEqual(estimateRequiredChars(15));
    expect(long).toBeGreaterThan(short * 5);
  });

  it('continues seamlessly without changing existing text', () => {
    const s = new PassageStream(9);
    s.ensureLength(1000);
    const before = s.text;
    s.ensureLength(5000);
    expect(s.text.startsWith(before)).toBe(true);
  });

  it('does not repeat a sentence until the theme deck is exhausted', () => {
    const s = buildPassage(3, 5);
    const sentences = s.text.split(/(?<=\.)\s/);
    const firstHalf = sentences.slice(0, 40);
    expect(new Set(firstHalf).size).toBe(firstHalf.length);
  });

  it('honours the recent-theme avoidance list', () => {
    const s = new PassageStream(11, { avoidThemes: ['racing', 'engineering', 'strategy'] });
    s.appendSection();
    expect(['racing', 'engineering', 'strategy']).not.toContain(s.themesUsed[0]);
  });
});

describe('car model', () => {
  it('higher WPM produces more distance', () => {
    const slow = driveCar(30, 30_000).car.distance;
    const fast = driveCar(80, 30_000).car.distance;
    expect(fast).toBeGreaterThan(slow * 2);
  });

  it('never drives past the typed frontier', () => {
    const { car, typing } = driveCar(70, 20_000);
    expect(car.distance).toBeLessThanOrEqual(typing.lock + typing.entries.length);
  });

  it('errors slow the car and a sustained critical state crashes it', () => {
    const clean = driveCar(60, 20_000);
    const messy = driveCar(60, 20_000, { errorsAt: [40] });
    expect(messy.crashes).toBeGreaterThanOrEqual(1);
    expect(messy.car.distance).toBeLessThan(clean.car.distance);
  });

  it('correcting errors lets the car recover and keep moving', () => {
    const fixed = driveCar(60, 30_000, { errorsAt: [40], fixErrors: true });
    const unfixed = driveCar(60, 30_000, { errorsAt: [40] });
    expect(fixed.car.distance).toBeGreaterThan(unfixed.car.distance + 50);
  });

  it('is independent of how often the renderer samples it (fixed steps)', () => {
    const a = driveCar(55, 10_000).car.distance;
    const b = driveCar(55, 10_000).car.distance;
    expect(a).toBe(b);
  });
});

describe('start lights', () => {
  it('schedules five ascending lights before a randomized start', () => {
    const early = scheduleStart(0, 0);
    const late = scheduleStart(0, 1);
    expect(early.lightsAt).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(early.lightsAt[i]).toBeGreaterThan(early.lightsAt[i - 1]);
    expect(late.startAt - early.startAt).toBe(START_LIGHTS.MAX_HOLD_MS - START_LIGHTS.MIN_HOLD_MS);
  });
});

describe('race simulation', () => {
  function newSim(minutes = 1) {
    const sim = new RaceSim('r1', buildPassage(5, minutes), 1_000, minutes * 60_000);
    sim.addRacer({ id: 'p1', name: 'Player', carId: 'scarlet', isBot: false });
    return sim;
  }

  it('penalises input before lights out', () => {
    const sim = newSim();
    expect(sim.input('p1', 'T', 500)).toEqual({ ok: false, reason: 'false-start' });
    expect(sim.input('p1', sim.text[0], 1_500)).toEqual({ ok: false, reason: 'penalty' });
    expect(sim.input('p1', sim.text[0], 1_000 + START_LIGHTS.FALSE_START_PENALTY_MS)).toMatchObject({ ok: true });
  });

  it('rejects post-finish input and ends exactly at the duration', () => {
    const sim = newSim();
    const ev = sim.tick(1_000 + 60_000);
    expect(ev.finished).toBe(true);
    expect(sim.input('p1', sim.text[0], 61_500)).toEqual({ ok: false, reason: 'finished' });
  });

  it('extends the passage for fast typists without altering earlier text', () => {
    const sim = newSim(1);
    const original = sim.text;
    let t = 2_000;
    while (sim.text.length < original.length + 100) {
      const r = sim.racers.get('p1')!;
      const idx = r.typing.lock + r.typing.entries.length;
      sim.input('p1', sim.text[idx], t);
      t += 5;
      if (t > 60_000) break;
    }
    expect(sim.text.startsWith(original)).toBe(true);
    expect(sim.text.length).toBeGreaterThan(original.length);
  });

  it('bots of higher difficulty cover more distance', () => {
    const totals: Record<string, number> = {};
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const sim = new RaceSim('r', buildPassage(8, 1), 0, 60_000);
      createBotProfiles(d, 3, 8).forEach((profile, i) =>
        sim.addRacer({ id: `b${i}`, name: 'b', carId: 'scarlet', isBot: true }, { profile, seed: 100 + i })
      );
      sim.tick(60_000);
      totals[d] = sim.results().reduce((a, r) => a + r.distance, 0);
    }
    expect(totals.medium).toBeGreaterThan(totals.easy);
    expect(totals.hard).toBeGreaterThan(totals.medium);
  });

  it('bots make and correct mistakes through the typing engine', () => {
    const sim = new RaceSim('r', buildPassage(8, 1), 0, 60_000);
    const [profile] = createBotProfiles('easy', 1, 3);
    sim.addRacer({ id: 'b', name: 'b', carId: 'scarlet', isBot: true }, { profile, seed: 4 });
    sim.tick(60_000);
    const [r] = sim.results();
    expect(r.totalErrors).toBeGreaterThan(0);
    expect(r.correctedErrors).toBeGreaterThan(0);
    expect(r.accuracy).toBeLessThan(100);
    expect(r.effectiveWpm).toBeGreaterThan(10);
  });

  it('is fully deterministic for identical inputs', () => {
    const run = () => {
      const sim = new RaceSim('r', buildPassage(8, 1), 0, 60_000);
      createBotProfiles('medium', 4, 8).forEach((profile, i) =>
        sim.addRacer({ id: `b${i}`, name: 'b', carId: 'scarlet', isBot: true }, { profile, seed: i })
      );
      sim.tick(60_000);
      return sim.results();
    };
    expect(run()).toEqual(run());
  });
});

describe('ranking', () => {
  it('orders by distance, then effective WPM, then accuracy, then id', () => {
    const rows = [
      { id: 'c', distance: 100, effectiveWpm: 50, accuracy: 90 },
      { id: 'a', distance: 100, effectiveWpm: 50, accuracy: 95 },
      { id: 'b', distance: 100, effectiveWpm: 60, accuracy: 80 },
      { id: 'd', distance: 120, effectiveWpm: 10, accuracy: 50 },
      { id: 'e', distance: 100, effectiveWpm: 50, accuracy: 90 }
    ];
    expect(rank(rows).map((r) => r.id)).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(compareRacers(rows[0], rows[4])).toBeLessThan(0);
  });
});
