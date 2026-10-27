// Small deterministic PRNG utilities. Every random decision that must be
// identical on several machines (passages, bot behaviour) goes through these.

export type Rng = () => number;

/** mulberry32: fast, decent-quality 32-bit seeded generator returning [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash, handy for deriving sub-seeds from strings. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Approximately normal sample (Irwin-Hall with 4 terms), mean 0, sd ~1. */
export function randNormal(rng: Rng): number {
  return (rng() + rng() + rng() + rng() - 2) * Math.sqrt(3);
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
