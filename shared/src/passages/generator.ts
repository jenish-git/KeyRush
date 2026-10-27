// Deterministic, duration-aware passage assembly.
//
// A PassageStream is fully determined by its seed: two machines that create a
// stream with the same seed and request the same lengths produce byte-identical
// text. The server owns the seed in multiplayer; clients only ever receive text.

import { PASSAGE, TYPING } from '../constants';
import { createRng, randInt, shuffle, type Rng } from '../rng';
import { LIBRARY, THEMES, type Theme } from './library';

export interface PassageOptions {
  /** Themes to avoid for the first section (recent-selection cache). */
  avoidThemes?: Theme[];
}

/** Characters needed for a race: expected WPM x minutes x 5 x safety margin. */
export function estimateRequiredChars(minutes: number, expectedWpm: number = PASSAGE.EXPECTED_WPM): number {
  const chars = expectedWpm * minutes * TYPING.CHARS_PER_WORD * PASSAGE.SAFETY_MARGIN;
  return Math.max(PASSAGE.MIN_CHARS, Math.ceil(chars));
}

export class PassageStream {
  private rng: Rng;
  /** Per-theme shuffled decks; a sentence is reused only after its deck is exhausted. */
  private decks = new Map<Theme, string[]>();
  private themeOrder: Theme[] = [];
  private lastTheme: Theme | null = null;
  readonly themesUsed: Theme[] = [];
  text = '';

  constructor(readonly seed: number, private options: PassageOptions = {}) {
    this.rng = createRng(seed);
  }

  private nextTheme(): Theme {
    if (this.themeOrder.length === 0) {
      let order = shuffle(this.rng, THEMES);
      if (this.themesUsed.length === 0 && this.options.avoidThemes?.length) {
        const avoid = new Set(this.options.avoidThemes);
        const preferred = order.filter((t) => !avoid.has(t));
        if (preferred.length) order = [...preferred, ...order.filter((t) => avoid.has(t))];
      }
      // Never run the same theme twice in a row across deck boundaries.
      if (order[0] === this.lastTheme && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
      this.themeOrder = order;
    }
    const theme = this.themeOrder.shift()!;
    this.lastTheme = theme;
    this.themesUsed.push(theme);
    return theme;
  }

  private drawSentence(theme: Theme): string {
    let deck = this.decks.get(theme);
    if (!deck || deck.length === 0) {
      deck = shuffle(this.rng, LIBRARY[theme]);
      this.decks.set(theme, deck);
    }
    return deck.pop()!;
  }

  /** Append one themed section of 3-6 sentences. Returns the appended text. */
  appendSection(): string {
    const theme = this.nextTheme();
    const count = randInt(this.rng, 3, 6);
    const sentences: string[] = [];
    for (let i = 0; i < count; i++) sentences.push(this.drawSentence(theme));
    const section = (this.text.length ? ' ' : '') + sentences.join(' ');
    this.text += section;
    return section;
  }

  /** Grow the text until it is at least minChars long. Returns the appended text. */
  ensureLength(minChars: number): string {
    const start = this.text.length;
    while (this.text.length < minChars) this.appendSection();
    return this.text.slice(start);
  }
}

export function buildPassage(seed: number, minutes: number, options?: PassageOptions): PassageStream {
  const stream = new PassageStream(seed, options);
  stream.ensureLength(estimateRequiredChars(minutes));
  return stream;
}
