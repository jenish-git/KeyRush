// AI drivers. Bots do not move at a fixed speed: they generate keystrokes
// (including mistakes, delayed noticing and backspace corrections) that go
// through the exact same typing engine and car model as human players.

import { createRng, randInt, randNormal, randRange, type Rng } from '../rng';
import { backspace, cursorIndex, typeChar, type TypingState } from '../typing/engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyProfile {
  wpm: [number, number];
  /** Relative std-dev of the inter-key interval. */
  jitter: number;
  errorRate: [number, number];
  /** Extra characters typed before a mistake is noticed. */
  notice: [number, number];
  /** Probability of a short hesitation at a word boundary. */
  pauseChance: number;
  pauseMs: [number, number];
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  easy: { wpm: [22, 40], jitter: 0.4, errorRate: [0.04, 0.07], notice: [1, 3], pauseChance: 0.08, pauseMs: [300, 1100] },
  medium: { wpm: [42, 64], jitter: 0.3, errorRate: [0.02, 0.04], notice: [0, 2], pauseChance: 0.05, pauseMs: [200, 800] },
  hard: { wpm: [68, 98], jitter: 0.2, errorRate: [0.006, 0.02], notice: [0, 1], pauseChance: 0.03, pauseMs: [150, 500] }
};

export const BOT_NAMES = [
  'R. Vettori', 'K. Lindqvist', 'M. Okafor', 'A. Duval', 'S. Tanaka',
  'L. Moreau', 'J. Kowalski', 'D. Reyes', 'T. Haddad', 'E. Novak',
  'P. Castell', 'N. Brandt'
];

export interface BotProfile {
  baseWpm: number;
  jitter: number;
  errorRate: number;
  notice: [number, number];
  pauseChance: number;
  pauseMs: [number, number];
}

export function createBotProfiles(difficulty: Difficulty, count: number, seed: number): BotProfile[] {
  const rng = createRng(seed ^ 0x5bd1e995);
  const p = DIFFICULTY[difficulty];
  const profiles: BotProfile[] = [];
  for (let i = 0; i < count; i++) {
    // Spread bots across the range so the field has a natural pace order.
    const slot = count === 1 ? 0.5 : i / (count - 1);
    const wpm = p.wpm[0] + (p.wpm[1] - p.wpm[0]) * (0.15 + 0.7 * slot) + randRange(rng, -3, 3);
    profiles.push({
      baseWpm: wpm,
      jitter: p.jitter,
      errorRate: randRange(rng, p.errorRate[0], p.errorRate[1]),
      notice: p.notice,
      pauseChance: p.pauseChance,
      pauseMs: p.pauseMs
    });
  }
  return profiles;
}

const WRONG_KEYS = 'asdfghjklqwertyuiopzxcvbnm';

export class BotDriver {
  private rng: Rng;
  private nextAt: number;
  private form = 1;
  /** Remaining characters to type before noticing the current mistake. */
  private untilNotice = -1;

  constructor(readonly profile: BotProfile, seed: number, raceStart: number) {
    this.rng = createRng(seed);
    this.nextAt = raceStart + randRange(this.rng, 180, 650); // reaction time
  }

  private interval(): number {
    const wpm = Math.max(8, this.profile.baseWpm * this.form);
    const mean = 60_000 / (wpm * 5);
    const factor = Math.max(0.35, 1 + randNormal(this.rng) * this.profile.jitter);
    return mean * factor;
  }

  /** Perform every action scheduled up to `until`. Returns number of actions taken. */
  advance(typing: TypingState, text: string, until: number): number {
    let actions = 0;
    while (this.nextAt <= until && actions < 200) {
      const t = this.nextAt;
      actions++;
      // Slow random walk of "form" so pace varies over a race.
      this.form = Math.min(1.12, Math.max(0.88, this.form + randNormal(this.rng) * 0.01));

      if (typing.firstError !== -1) {
        if (this.untilNotice > 0) {
          this.untilNotice--;
          const idx = cursorIndex(typing);
          if (idx < text.length) typeChar(typing, text, text[idx], t);
          this.nextAt = t + this.interval();
        } else {
          backspace(typing, t);
          this.nextAt = t + this.interval() * 0.6; // corrections are quicker
          if (typing.firstError === -1) this.nextAt += randRange(this.rng, 100, 300);
        }
        continue;
      }

      const idx = cursorIndex(typing);
      if (idx >= text.length) {
        this.nextAt = t + 100;
        continue;
      }
      const expected = text[idx];
      if (expected !== ' ' && this.rng() < this.profile.errorRate) {
        let wrong = WRONG_KEYS[randInt(this.rng, 0, WRONG_KEYS.length - 1)];
        if (wrong === expected.toLowerCase()) wrong = wrong === 'e' ? 'r' : 'e';
        typeChar(typing, text, wrong, t);
        this.untilNotice = randInt(this.rng, this.profile.notice[0], this.profile.notice[1]);
      } else {
        typeChar(typing, text, expected, t);
      }
      let next = this.interval();
      if (expected === ' ' && this.rng() < this.profile.pauseChance) {
        next += randRange(this.rng, this.profile.pauseMs[0], this.profile.pauseMs[1]);
      }
      this.nextAt = t + next;
    }
    return actions;
  }
}
