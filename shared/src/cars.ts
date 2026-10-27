// Cosmetic car liveries. Original designs; no performance differences.

export interface CarLivery {
  id: string;
  name: string;
  body: string;
  accent: string;
  stripe: string;
  number: number;
}

export const CARS: readonly CarLivery[] = [
  { id: 'scarlet', name: 'Scarlet Arrow', body: '#d90f1c', accent: '#f4f4f4', stripe: '#1a1a1a', number: 1 },
  { id: 'graphite', name: 'Graphite GT', body: '#2e3238', accent: '#e8202b', stripe: '#c9ced6', number: 7 },
  { id: 'glacier', name: 'Glacier', body: '#e9eef3', accent: '#1663d6', stripe: '#d90f1c', number: 11 },
  { id: 'volt', name: 'Volt', body: '#c8f031', accent: '#111111', stripe: '#2e3238', number: 23 },
  { id: 'ocean', name: 'Deep Ocean', body: '#0b3d91', accent: '#ffb000', stripe: '#e9eef3', number: 31 },
  { id: 'papaya', name: 'Papaya Flash', body: '#ff7a00', accent: '#1d6bff', stripe: '#111111', number: 44 },
  { id: 'emerald', name: 'Emerald', body: '#0b8f5a', accent: '#f4f4f4', stripe: '#c9a227', number: 55 },
  { id: 'violet', name: 'Night Violet', body: '#5b2bb5', accent: '#39e1ff', stripe: '#111111', number: 63 },
  { id: 'gold', name: 'Gold Rush', body: '#c9a227', accent: '#111111', stripe: '#f4f4f4', number: 81 },
  { id: 'rose', name: 'Rose Quartz', body: '#e85d9a', accent: '#f4f4f4', stripe: '#2e3238', number: 99 }
];

export const DEFAULT_CAR_ID = CARS[0].id;

export function getCar(id: string | undefined): CarLivery {
  return CARS.find((c) => c.id === id) ?? CARS[0];
}

export function isCarId(id: unknown): id is string {
  return typeof id === 'string' && CARS.some((c) => c.id === id);
}
