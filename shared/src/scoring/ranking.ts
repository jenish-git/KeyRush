// Deterministic ranking policy, shared by the live leaderboard and final results.
//
// 1. Greater official distance (car position, in passage characters).
// 2. Higher effective WPM.
// 3. Higher accuracy.
// 4. Stable identifier order, so equal entries always sort identically.
//
// Distance and WPM are compared after rounding to 3 decimals so floating-point
// noise can never reorder players between machines.

export interface Rankable {
  id: string;
  distance: number;
  effectiveWpm: number;
  accuracy: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function compareRacers(a: Rankable, b: Rankable): number {
  return (
    r3(b.distance) - r3(a.distance) ||
    r3(b.effectiveWpm) - r3(a.effectiveWpm) ||
    r3(b.accuracy) - r3(a.accuracy) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function rank<T extends Rankable>(items: T[]): T[] {
  return items.slice().sort(compareRacers);
}
